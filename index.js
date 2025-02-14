const express = require('express');
const app = express();

// Gør det muligt at læse JSON-body fra webhooks
app.use(express.json());

// Opret en endpoint, fx /webhook, der modtager POST-anmodninger
app.post('/webhook', (req, res) => {
  // Log hele payloaden med indrykning, så du ser alle detaljer
  console.log("Fuld payload modtaget:", JSON.stringify(req.body, null, 2));
  
  // Hent VariantChanges fra body
  const { VariantChanges } = req.body;
  
  // Antag at der altid sendes mindst én variant. Hvis der kan være flere,
  // kan du erstatte med et loop (se kommentar nedenfor).
  if (Array.isArray(VariantChanges) && VariantChanges.length > 0) {
    const { Id, UpdatedAttributes } = VariantChanges[0];
    console.log("Variant Id:", Id);
    console.log("Updated Attributes:", UpdatedAttributes);

    // Her kan du kalde en funktion, der håndterer varianten
    // f.eks. processVariant(Id, UpdatedAttributes);
  }

  /* Hvis der kan komme flere varianter i en enkelt webhook, kan du bruge:
  VariantChanges.forEach(variant => {
    const { Id, UpdatedAttributes } = variant;
    console.log("Variant Id:", Id);
    console.log("Updated Attributes:", UpdatedAttributes);
    // processVariant(Id, UpdatedAttributes);
  });
  */

  res.status(200).send('OK');
});

// Start serveren
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveren kører på port ${PORT}`);
});
