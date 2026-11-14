export function createUploadController(service) {
  return {
    async document(req, res) {
      const id = req.params.id;
      const data = await service.saveDocument(id, req.file, req.body, req.log, req.requestId);
      req.log.info('Documento asociado a un usuario', { requestId: req.requestId, userId: id });
      res.status(201).json({ data });
    },
    async proof(req, res) {
      const id = req.params.id;
      const data = await service.saveProof(id, req.file, req.body, req.log, req.requestId);
      req.log.info('Comprobante asociado a una entrega', { requestId: req.requestId, deliveryId: id });
      res.status(201).json({ data });
    }
  };
}
