const express = require('express');
const app = express();

// Gør det muligt at læse JSON-body fra webhooks
app.use(express.json());

// Opret en endpoint, fx /webhook, der modtager POST-anmodninger
app.post('/webhook', (req, res) => {
  // Her kan du se, hvad PIM-systemet sender i body:
  console.log('Modtaget webhook-body:', req.body);

  // Send 200 OK tilbage, så PIM ved, at anmodningen blev modtaget
  res.status(200).send('OK');
});

// Start serveren
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveren kører på port ${PORT}`);
});
