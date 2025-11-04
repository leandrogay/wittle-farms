import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const CommentSchema = new Schema(
  {
    task: { type: Types.ObjectId, ref: "Task", required: true, index: true },
    author: { type: Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    mentions: [{ type: Types.ObjectId, ref: "User", index: true }],
//    attachments: [{ type: Types.ObjectId, ref: "Attachment" }],
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommentSchema.add({
  clientKey: { type: String, index: true },
});

CommentSchema.index(
  { clientKey: 1 },
  { unique: true, partialFilterExpression: { clientKey: { $type: "string" } } }
);

export default model("Comment", CommentSchema);

/**
 * @openapi
 * components:
 *   schemas:
 *     MentionableUser:
 *       type: object
 *       description: A user who can be @mentioned in a task comment.
 *       properties:
 *         id:
 *           type: string
 *           description: User ID (MongoDB ObjectId)
 *           example: "64fa8a3e91d2f6d98a5fce43"
 *         name:
 *           type: string
 *           example: "Jane Doe"
 *         email:
 *           type: string
 *           format: email
 *           example: "jane@littlefarms.com"
 *
 *     Comment:
 *       type: object
 *       description: A comment on a task.
 *       properties:
 *         id:
 *           type: string
 *           description: Comment ID (MongoDB ObjectId)
 *           example: "6712e7c4ffb6d0d5b2d4d3ab"
 *         taskId:
 *           type: string
 *           description: Task ID this comment belongs to (MongoDB ObjectId)
 *           example: "6502a9d1b2a4c7c89a01b1ef"
 *         author:
 *           $ref: "#/components/schemas/MentionableUser"
 *         message:
 *           type: string
 *           description: Comment body (may include @mentions)
 *           example: "Blocking on QA from @John Smith."
 *         mentions:
 *           type: array
 *           description: Resolved users mentioned in the comment body
 *           items:
 *             $ref: "#/components/schemas/MentionableUser"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2025-11-04T12:34:56.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2025-11-04T13:02:11.000Z"
 *
 *     NewCommentRequest:
 *       type: object
 *       required: [message]
 *       properties:
 *         message:
 *           type: string
 *           description: Comment text. Use @name to mention users.
 *           example: "Looks good. @Jane please review."
 *         mentions:
 *           type: array
 *           description: (Optional) Explicit mentions if you pre-resolve them
 *           items:
 *             $ref: "#/components/schemas/MentionableUser"
 *
 *     UpdateCommentRequest:
 *       type: object
 *       description: Fields allowed when updating a comment.
 *       properties:
 *         message:
 *           type: string
 *           example: "Updated after review."
 *
 *     CommentListResponse:
 *       type: object
 *       description: Cursor-paginated list of comments (newest first).
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/Comment"
 *         nextCursor:
 *           type: string
 *           nullable: true
 *           example: "cmVzdW1lX2N1cnNvcj0xNzI4NDI5OTk5"
 *
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Comment not found"
 */