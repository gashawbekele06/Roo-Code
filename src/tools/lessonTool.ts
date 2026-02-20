// src/tools/lessonTool.ts
export const recordLesson = async (args: { lesson: string }) => {
	const sharedBrainPath = path.join(process.cwd(), "AGENTS.md") // Or CLAUDE.md
	fs.appendFileSync(sharedBrainPath, `\n## Lesson Learned\n${args.lesson}\n`)
	return "Lesson recorded."
}
