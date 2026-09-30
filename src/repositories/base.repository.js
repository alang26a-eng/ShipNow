import { AppError } from '../utils/app-error.js';

// Centraliza filtros de baja lógica, proyecciones y traducción de errores de persistencia.
export function createRepository(model, projection) {
  async function execute(operation) {
    try { return await operation(); }
    catch (error) {
      if (error.code === 11000) throw new AppError(409, 'El valor único ya está registrado.');
      if (error.name === 'ValidationError' || error.name === 'CastError')
        throw new AppError(400, 'Los datos no cumplen el esquema de persistencia.');
      throw error;
    }
  }
  return {
    list: ({ page, limit }, filters = {}) => execute(() => model.find({ ...filters, deletedAt: null })
      .select(projection).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean()),
    findById: id => execute(() => model.findOne({ _id: id, deletedAt: null }).select(projection).lean()),
    create: data => execute(async () => {
      const document = await model.create(data);
      return Object.fromEntries(Object.keys(projection).filter(key => projection[key] && document[key] !== undefined)
        .map(key => [key, document[key]]));
    }),
    update: (id, data) => execute(() => model.findOneAndUpdate(
      { _id: id, deletedAt: null }, { $set: data }, { new: true, runValidators: true }
    ).select(projection).lean()),
    remove: id => execute(() => model.findOneAndUpdate(
      { _id: id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true }
    ).select(projection).lean())
  };
}
