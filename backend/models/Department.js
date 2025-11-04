import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

export default model('Department', DepartmentSchema);

/**
 * @openapi
 * components:
 *   schemas:
 *     Department:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: MongoDB ObjectId
 *           example: "665f7f8a5e1c9c0f1a2b3c4d"
 *         name:
 *           type: string
 *           example: "Engineering"
 *         description:
 *           type: string
 *           example: "Responsible for product development"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *       required:
 *         - name
 *
 *     DepartmentCreate:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *       required:
 *         - name
 *
 *     DepartmentUpdate:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         description:
 *           type: string
 *       description: |
 *         Provide one or more fields to update. Validation rules from the model still apply.
 *
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *       required:
 *         - message
 */
