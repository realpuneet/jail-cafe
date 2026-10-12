import { ApiError } from '../utils/ApiError.js';

/**
 * Validate request parts with Zod schemas. Parsed (coerced, stripped) values replace the originals.
 * @param {{body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType}} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        return next(
          ApiError.validation('Validation failed', formatZodIssues(result.error.issues, part)),
        );
      }
      req[part] = result.data;
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export const formatZodIssues = (issues, location) =>
  issues.map((i) => ({ location, path: i.path.join('.'), message: i.message }));
