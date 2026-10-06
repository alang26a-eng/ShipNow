export function createMockController(service) {
  return {
    users: (req, res) => res.json(service.users(req.query)),
    drivers: (req, res) => res.json(service.drivers(req.query)),
    orders: (req, res) => res.json(service.orders(req.query)),
    deliveries: (req, res) => res.json(service.deliveries(req.query)),
    scenario: (req, res) => res.json(service.scenario(req.query)),
    seed: async (req, res) => res.status(201).json(await service.seed(req.query, req.body))
  };
}
