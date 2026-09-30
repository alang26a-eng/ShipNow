export function createUserController(service) {
  return {
    list: async (req, res) => res.json({ data: await service.list(req.query) }),
    get: async (req, res) => res.json({ data: await service.get(req.params.id) }),
    create: async (req, res) => res.status(201).json({ data: await service.create(req.body) }),
    update: async (req, res) => res.json({ data: await service.update(req.params.id, req.body) }),
    remove: async (req, res) => { await service.remove(req.params.id); res.status(204).end(); }
  };
}
