import { badRequest } from '../utils/http-error.js';

/**
 * Validates request parts against Zod schemas. Parsed (coerced, trimmed) values are stored on
 * req.validated.{body,query,params}; controllers must read input from there, not from req.body.
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {};
    const issues = [];

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (issues.length) return next(badRequest('Request validation failed', issues));
    next();
  };
}
