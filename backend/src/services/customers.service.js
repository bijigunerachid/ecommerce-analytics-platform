import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, isPgError } from '../db/pg-errors.js';
import { paginationMeta } from '../db/query-helpers.js';
import { conflict, notFound } from '../utils/http-error.js';

function translateWriteError(err) {
  if (isPgError(err, PG_UNIQUE_VIOLATION, 'customers_email_unique')) {
    return conflict('A customer with this email already exists');
  }
  return err;
}

export function createCustomersService({ customersRepository }) {
  return {
    async list(query) {
      const { items, total } = await customersRepository.list(query);
      return { data: items, pagination: paginationMeta(query, total) };
    },

    async get(id) {
      const customer = await customersRepository.findById(id);
      if (!customer) throw notFound('Customer not found');
      return customer;
    },

    async create(input) {
      try {
        return await customersRepository.create(input);
      } catch (err) {
        throw translateWriteError(err);
      }
    },

    async update(id, changes) {
      let customer;
      try {
        customer = await customersRepository.update(id, changes);
      } catch (err) {
        throw translateWriteError(err);
      }
      if (!customer) throw notFound('Customer not found');
      return customer;
    },

    async delete(id) {
      let deleted;
      try {
        deleted = await customersRepository.delete(id);
      } catch (err) {
        if (isPgError(err, PG_FOREIGN_KEY_VIOLATION)) {
          throw conflict('Customer has orders and cannot be deleted');
        }
        throw err;
      }
      if (!deleted) throw notFound('Customer not found');
    },
  };
}
