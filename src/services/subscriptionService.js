class SubscriptionService {
  async listSubscriptions() {
    return {
      success: true,
      data: [],
      message: 'Subscription list is ready for DB integration.',
    };
  }

  async createSubscription(payload) {
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('Subscription payload is required'), { statusCode: 400 });
    }

    const { name, plan, price, status } = payload;

    if (!name || !plan || !price || !status) {
      throw Object.assign(new Error('name, plan, price and status are required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: {
        id: Date.now(),
        name,
        plan,
        price,
        status,
      },
      message: 'Subscription created in memory for now. DB integration will be added later.',
    };
  }

  async getSubscriptionById(id) {
    if (!id) {
      throw Object.assign(new Error('Subscription id is required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: {
        id,
        name: 'Example Subscription',
        status: 'active',
      },
      message: 'Subscription fetched successfully.',
    };
  }

  async updateSubscription(id, payload) {
    if (!id) {
      throw Object.assign(new Error('Subscription id is required'), { statusCode: 400 });
    }

    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('Subscription payload is required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: {
        id,
        ...payload,
      },
      message: 'Subscription updated successfully. DB layer is pending.',
    };
  }

  async deleteSubscription(id) {
    if (!id) {
      throw Object.assign(new Error('Subscription id is required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: { id },
      message: 'Subscription deleted successfully. DB layer is pending.',
    };
  }
}

module.exports = new SubscriptionService();
