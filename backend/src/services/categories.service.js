import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, isPgError } from '../db/pg-errors.js';
import { paginationMeta } from '../db/query-helpers.js';
import { conflict, notFound } from '../utils/http-error.js';

function translateWriteError(err) {
  if (isPgError(err, PG_UNIQUE_VIOLATION, 'categories_name_unique')) {
    return conflict('A category with this name already exists');
  }
  return err;
}

export function createCategoriesService({ categoriesRepository }) {
  return {
    async list(query) {
      const { items, total } = await categoriesRepository.list(query);
      return { data: items, pagination: paginationMeta(query, total) };
    },

    async get(id) {
      const category = await categoriesRepository.findById(id);
      if (!category) throw notFound('Category not found');
      return category;
    },

    async create(input) {
      try {
        return await categoriesRepository.create(input);
      } catch (err) {
        throw translateWriteError(err);
      }
    },

    async update(id, changes) {
      let category;
      try {
        category = await categoriesRepository.update(id, changes);
      } catch (err) {
        throw translateWriteError(err);
      }
      if (!category) throw notFound('Category not found');
      return category;
    },

    async delete(id) {
      let deleted;
      try {
        deleted = await categoriesRepository.delete(id);
      } catch (err) {
        if (isPgError(err, PG_FOREIGN_KEY_VIOLATION)) {
          throw conflict('Category still has products; move or delete them first');
        }
        throw err;
      }
      if (!deleted) throw notFound('Category not found');
    },
  };
}
