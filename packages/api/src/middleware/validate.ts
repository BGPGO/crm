import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler';

type FieldRule =
  | 'required'
  | { type: 'string' | 'number' | 'boolean' }
  | { minLength: number }
  | { maxLength: number }
  | { min: number }
  | { max: number };

type FieldSchema = FieldRule | FieldRule[];

export interface ValidationSchema {
  [field: string]: FieldSchema;
}

function checkField(
  field: string,
  value: unknown,
  rules: FieldRule[]
): string | null {
  const isRequired = rules.includes('required');
  const isEmpty = value === undefined || value === null || value === '';

  if (isEmpty) {
    if (isRequired) {
      return `Field '${field}' is required`;
    }
    return null;
  }

  for (const rule of rules) {
    if (rule === 'required') continue;

    if (typeof rule === 'object') {
      if ('type' in rule) {
        // eslint-disable-next-line valid-typeof
        if (typeof value !== rule.type) {
          return `Field '${field}' must be of type ${rule.type}`;
        }
      }

      if ('minLength' in rule) {
        if (typeof value !== 'string' || value.length < rule.minLength) {
          return `Field '${field}' must have at least ${rule.minLength} characters`;
        }
      }

      if ('maxLength' in rule) {
        if (typeof value !== 'string' || value.length > rule.maxLength) {
          return `Field '${field}' must have at most ${rule.maxLength} characters`;
        }
      }

      if ('min' in rule) {
        if (typeof value !== 'number' || value < rule.min) {
          return `Field '${field}' must be at least ${rule.min}`;
        }
      }

      if ('max' in rule) {
        if (typeof value !== 'number' || value > rule.max) {
          return `Field '${field}' must be at most ${rule.max}`;
        }
      }
    }
  }

  return null;
}

export function validate(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const normalizedRules = Array.isArray(rules) ? rules : [rules];
      const value = (req.body as Record<string, unknown>)[field];
      const error = checkField(field, value, normalizedRules);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      return next(createError('Validation failed', 422, errors));
    }

    next();
  };
}
