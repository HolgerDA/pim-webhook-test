const express = require('express');
const app = express();

// Gør det muligt at læse JSON-body fra webhooks
app.use(express.json());

// Opret en endpoint, fx /webhook, der modtager POST-anmodninger
app.post('/webhook', (req, res) => {
  // Log hele payloaden med indrykning, så du ser alle detaljer
  console.log("Fuld payload modtaget:", JSON.stringify(req.body, null, 2));
  res.status(200).send('OK');
});


// Start serveren
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveren kører på port ${PORT}`);
});
