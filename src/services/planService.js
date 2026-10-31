class PlanService {
  async listPlans() {
    return {
      success: true,
      data: [
        { id: 1, name: 'Basic', price: 29, interval: 'monthly', features: ['1 project', 'Email support'] },
        { id: 2, name: 'Pro', price: 79, interval: 'monthly', features: ['Unlimited projects', 'Priority support'] },
        { id: 3, name: 'Enterprise', price: 199, interval: 'monthly', features: ['Custom integrations', 'Dedicated manager'] },
      ],
      message: 'Plans listed successfully.',
    };
  }

  async createPlan(payload) {
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('Plan payload is required'), { statusCode: 400 });
    }

    const { name, price, interval } = payload;
    if (!name || !price || !interval) {
      throw Object.assign(new Error('name, price and interval are required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: { id: Date.now(), name, price, interval },
      message: 'Plan created successfully.',
    };
  }
}

module.exports = new PlanService();
