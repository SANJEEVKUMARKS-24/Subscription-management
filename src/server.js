const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const planRoutes = require('./routes/planRoutes');
const billingRoutes = require('./routes/billingRoutes');
const bootstrapRoutes = require('./routes/bootstrapRoutes');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Subscription Management backend is running',
    environment: env.nodeEnv,
  });
});

app.use(`/api/${env.apiVersion}`, authRoutes);
app.use(`/api/${env.apiVersion}`, bootstrapRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, subscriptionRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, planRoutes);
app.use(`/api/${env.apiVersion}`, authMiddleware, billingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});
