// src/tools/lessonTools.ts
import * as fs from "fs"
import * as path from "path"

export const recordLessonTool = {
	name: "record_lesson",
	description: "Append a lesson learned or architectural note to the shared brain file (AGENTS.md).",

	parameters: {
		type: "object",
		properties: {
			lesson: {
				type: "string",
				description: "Concise description of the lesson, failure reason, or decision",
			},
			category: {
				type: "string",
				enum: ["failure", "design", "style", "concurrency", "other"],
				description: "Optional category for filtering",
			},
		},
		required: ["lesson"],
	},

	execute: (args: { lesson: string; category?: string }) => {
		try {
			const brainPath = path.join(process.cwd(), "AGENTS.md")
			const timestamp = new Date().toISOString()
			const categoryLine = args.category ? `**Category:** ${args.category}\n` : ""

			const entry = `\n### ${timestamp}\n${categoryLine}**Lesson:** ${args.lesson.trim()}\n`

			fs.mkdirSync(path.dirname(brainPath), { recursive: true })
			fs.appendFileSync(brainPath, entry)

			return { success: true, message: "Lesson recorded to shared brain." }
		} catch (err: any) {
			return {
				success: false,
				error: { type: "tool-error", message: err.message, code: "LESSON_RECORD_FAILED" },
			}
		}
	},
}
