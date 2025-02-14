
/********************************************************
 * 0. Opsæt Express-server & webhook-endpoint
 ********************************************************/
const express = require('express');
const axios = require('axios');
const fetch = require('node-fetch'); // Hvis du bruger node-fetch (npm install node-fetch)
const app = express();

// Gør det muligt at læse JSON-body fra webhooks
app.use(express.json());

// Webhook-endpoint
app.post('/webhook', async (req, res) => {
  console.log("Fuld payload modtaget:", JSON.stringify(req.body, null, 2));

  const { VariantChanges } = req.body;

  if (Array.isArray(VariantChanges) && VariantChanges.length > 0) {
    for (const change of VariantChanges) {
      const { Id, UpdatedAttributes } = change;

      // Tjek om "Materials" er i UpdatedAttributes
      if (UpdatedAttributes.includes('Materials')) {
        console.log("Kører Materials-logic for Variant ID:", Id);

        try {
          // Kør hele workflowet med det pågældende variant-Id
          await main(Id);
        } catch (error) {
          console.error('Fejl ved kørsel af main-funktionen:', error);
        }
      }
    }
  }

  res.status(200).send('OK');
});

// Start serveren
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveren kører på port ${PORT}`);
});

/********************************************************
 * 1. PIM: Hent data via REST (axios)
 ********************************************************/
const API_KEY = '96c2325e-1252-4803-9315-a30093ae4d85'; // Erstat med din rigtige PIM-nøgle

// Hjælpefunktion til at formatere et array til en tekststreng
function formatMaterialList(materialsArray) {
  if (materialsArray.length === 0) return '';
  if (materialsArray.length === 1) return materialsArray[0];
  if (materialsArray.length === 2) return materialsArray.join(' og ');
  
  const allButLast = materialsArray.slice(0, materialsArray.length - 1).join(', ');
  const last = materialsArray[materialsArray.length - 1];
  return `${allButLast} og ${last}`;
}

async function getVariantDataFromPIM(variantId) {
  // Dynamisk URL baseret på variantId fra webhook
  const baseURL = `https://api.umage.cloud16.structpim.com/variants/${variantId}/attributevalues`;

  try {
    const response = await axios.get(baseURL, {
      headers: {
        Authorization: API_KEY,
      },
    });

    const { VariantId, Values } = response.data;
    console.log('=== Fuldt svar fra PIM ===');
    console.log(response.data);

    // Hent ShopifyVariantID
    const shopifyVariantID = Values?.ShopifyVariantID || null;

    console.log('\n-- Udvalgte attributter --');
    console.log('VariantId:', VariantId);
    console.log('ShopifyVariantID:', shopifyVariantID);

    // Udtræk materialer med "CultureCode": "en-GB"
    let enMaterials = [];
    if (
      Values.Materials &&
      Values.Materials.VariantMaterial &&
      Array.isArray(Values.Materials.VariantMaterial)
    ) {
      Values.Materials.VariantMaterial.forEach((material) => {
        const enMaterial = material.Name.find((item) => item.CultureCode === 'en-GB');
        if (enMaterial && enMaterial.Data) {
          enMaterials.push(enMaterial.Data);
        }
      });
    }

    // Formatér arrayet til en tekststreng
    const formattedMaterials = formatMaterialList(enMaterials);
    console.log('\n-- Formateret Materialer (kun en-GB) --');
    console.log(formattedMaterials);

    // Returner både ShopifyVariantID og materialeteksten,
    // så vi kan bruge dem i næste skridt
    return { shopifyVariantID, formattedMaterials };
  } catch (error) {
    console.error('Fejl ved hentning af variant-attributter:', error.message);
    throw error;
  }
}

/********************************************************
 * 2. Shopify: Opdater Metafield via GraphQL (node-fetch)
 ********************************************************/
const SHOPIFY_GRAPHQL_URL = 'https://umage-development-b2c.myshopify.com/admin/api/2023-01/graphql.json';
const ACCESS_TOKEN = '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'; // Erstat med din egen Shopify Access Token
const META_NAMESPACE = 'custom';
const META_KEY = 'materials';

async function updateVariantMetafield(shopifyVariantID, materialString) {
  try {
    // Byg det fulde GID dynamisk
    const variantGID = `gid://shopify/ProductVariant/${shopifyVariantID}`;
    
    // GraphQL-mutation til at sætte metafield
    const updateMutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Her sætter vi værdien til dine formaterede materialer
    const variables = {
      metafields: [
        {
          ownerId: variantGID,
          namespace: META_NAMESPACE,
          key: META_KEY,
          type: 'single_line_text_field',
          value: materialString,
        },
      ],
    };

    const updateResponse = await fetch(SHOPIFY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: updateMutation,
        variables,
      }),
    });

    const updateData = await updateResponse.json();

    if (updateData.errors) {
      console.error('Fejl i UPDATE-kaldet:', JSON.stringify(updateData.errors, null, 2));
      return;
    }

    const userErrors = updateData.data?.metafieldsSet?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.error('User errors ved opdatering:', userErrors);
      return;
    }

    const updatedMetafield = updateData.data?.metafieldsSet?.metafields?.[0];
    console.log('\n=== Efter opdatering ===');
    console.log('Opdateret metafield:', updatedMetafield);
  } catch (error) {
    console.error('Uventet fejl:', error);
  }
}

/********************************************************
 * 3. Kør hele workflowet
 ********************************************************/
async function main(variantId) {
  try {
    // 1) Hent data fra PIM for den specifikke variant
    const { shopifyVariantID, formattedMaterials } = await getVariantDataFromPIM(variantId);

    // Tjek om vi fik et gyldigt shopifyVariantID:
    if (!shopifyVariantID) {
      console.error('Fejl: ShopifyVariantID mangler. Kan ikke opdatere metafield.');
      return;
    }

    // 2) Opdater Shopify-metafield med materialer
    await updateVariantMetafield(shopifyVariantID, formattedMaterials);
  } catch (err) {
    console.error('Fejl i main-funktionen:', err);
  }
}
