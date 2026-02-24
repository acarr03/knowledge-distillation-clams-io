const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3847;

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

app.listen(PORT, () => {
  console.log(`[Dashboard] Curation dashboard running at http://localhost:${PORT}`);
});
