class BillingService {
  async listInvoices() {
    return {
      success: true,
      data: [
        { id: 1, subscriptionId: 101, amount: 29, status: 'paid', dueDate: '2026-11-15' },
        { id: 2, subscriptionId: 102, amount: 79, status: 'pending', dueDate: '2026-11-30' },
      ],
      message: 'Invoices listed successfully.',
    };
  }

  async createInvoice(payload) {
    if (!payload || typeof payload !== 'object') {
      throw Object.assign(new Error('Invoice payload is required'), { statusCode: 400 });
    }

    const { subscriptionId, amount, status } = payload;
    if (!subscriptionId || !amount || !status) {
      throw Object.assign(new Error('subscriptionId, amount and status are required'), { statusCode: 400 });
    }

    return {
      success: true,
      data: { id: Date.now(), subscriptionId, amount, status },
      message: 'Invoice created successfully.',
    };
  }
}

module.exports = new BillingService();
