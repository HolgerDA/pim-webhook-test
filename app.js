const axios = require('axios');
// Hvis du kører Node 18+, er fetch indbygget
// Er det ikke tilfældet, skal du evt. importere node-fetch i stedet
const fetch = global.fetch; // Node 18+

// Hent secrets fra miljøvariabler (Railway)
const PIM_API_KEY = process.env.PIM_API_KEY;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// URL og konstanter til Shopify
const SHOPIFY_GRAPHQL_URL = 'https://umage-development-b2c.myshopify.com/admin/api/2023-01/graphql.json';
const META_NAMESPACE = 'custom';
const META_KEY = 'materials';

/********************************************************
 * Hjælpefunktion til at formatere materialelisten
 ********************************************************/
function formatMaterialList(materialsArray) {
  if (materialsArray.length === 0) return '';
  if (materialsArray.length === 1) return materialsArray[0];
  if (materialsArray.length === 2) return materialsArray.join(' og ');

  const allButLast = materialsArray.slice(0, materialsArray.length - 1).join(', ');
  const last = materialsArray[materialsArray.length - 1];
  return `${allButLast} og ${last}`;
}

/********************************************************
 * 1. Hent data fra PIM via REST (axios)
 ********************************************************/
async function getVariantDataFromPIM(variantId) {
  // Byg PIM-url ud fra variantId
  const pimUrl = `https://api.umage.cloud16.structpim.com/variants/${variantId}/attributevalues`;

  try {
    const response = await axios.get(pimUrl, {
      headers: {
        Authorization: PIM_API_KEY,
      },
    });

    const { VariantId, Values } = response.data;
    console.log('=== Fuldt svar fra PIM ===');
    console.log(response.data);

    // Hent ShopifyVariantID fra PIM-responsen
    const shopifyVariantID = Values?.ShopifyVariantID;
    console.log('\n-- Udvalgte attributter --');
    console.log('VariantId:', VariantId);
    console.log('ShopifyVariantID:', shopifyVariantID);

    // Udtræk materialer med "CultureCode": "en-GB"
    let enMaterials = [];
    if (Values.Materials?.VariantMaterial && Array.isArray(Values.Materials.VariantMaterial)) {
      Values.Materials.VariantMaterial.forEach((material) => {
        const enMaterial = material.Name.find((item) => item.CultureCode === 'en-GB');
        if (enMaterial?.Data) {
          enMaterials.push(enMaterial.Data);
        }
      });
    }

    // Formatér materialerne
    const formattedMaterials = formatMaterialList(enMaterials);
    console.log('\n-- Formateret Materialer (kun en-GB) --');
    console.log(formattedMaterials);

    return { shopifyVariantID, formattedMaterials };
  } catch (error) {
    console.error('Fejl ved hentning af variant-attributter:', error.message);
    throw error;
  }
}

/********************************************************
 * 2. Opdater Shopify-metafelt via GraphQL (fetch)
 ********************************************************/
async function updateVariantMetafield(shopifyVariantID, materialString) {
  try {
    // Byg Shopify GID
    const variantGID = `gid://shopify/ProductVariant/${shopifyVariantID}`;

    // GraphQL-mutation
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
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: updateMutation, variables }),
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
 * 3. Hovedfunktion: Hent data fra PIM og opdater Shopify
 ********************************************************/
async function main(variantId) {
  try {
    // 1) Hent data fra PIM
    const { shopifyVariantID, formattedMaterials } = await getVariantDataFromPIM(variantId);

    // 2) Opdater Shopify-metafield
    if (!shopifyVariantID) {
      console.error('Fejl: ShopifyVariantID mangler. Kan ikke opdatere metafield.');
      return;
    }

    await updateVariantMetafield(shopifyVariantID, formattedMaterials);
  } catch (err) {
    console.error('Fejl i main-funktionen:', err);
  }
}

// Eksportér main, så den kan kaldes fra server.js
module.exports = { main };
