require('dotenv').config();
const express = require('express');
const { main } = require('./app'); // Importér workflow-funktionen
const app = express();

// Gør det muligt at læse JSON-body fra webhooks
app.use(express.json());

app.post('/webhook', async (req, res) => {
  console.log('Fuld payload modtaget:', JSON.stringify(req.body, null, 2));

  const { VariantChanges } = req.body;

  if (Array.isArray(VariantChanges) && VariantChanges.length > 0) {
    const { Id, UpdatedAttributes } = VariantChanges[0];

    console.log('Variant Id:', Id);
    console.log('Updated Attributes:', UpdatedAttributes);

    // Tjek om "Materials" er opdateret
    if (UpdatedAttributes.includes('Materials')) {
      try {
        // Kør workflow-funktion med variant-Id
        await main(Id);
      } catch (error) {
        console.error('Fejl ved kørsel af main-funktionen:', error);
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
