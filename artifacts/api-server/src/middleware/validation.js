const { z } = require('zod');

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN']),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const availabilitySchema = z.object({
  startTime: z.string().datetime({ message: 'startTime must be a valid ISO date-time' }),
  endTime: z.string().datetime({ message: 'endTime must be a valid ISO date-time' }),
});

const bookingSchema = z.object({
  slotId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const prescriptionSchema = z.object({
  content: z.string().min(1, 'content is required'),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validate,
  signupSchema,
  loginSchema,
  availabilitySchema,
  bookingSchema,
  prescriptionSchema,
};
