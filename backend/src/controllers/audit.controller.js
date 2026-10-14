import { paginationMeta } from '../db/query-helpers.js';

export function createAuditController({ auditRepository }) {
  return {
    async list(req, res) {
      const query = req.validated.query;
      const { items, total } = await auditRepository.list(query);
      res.json({ data: items, pagination: paginationMeta(query, total) });
    },
  };
}
