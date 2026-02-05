import type { Formatter, OutputFormat } from "../types.js";
import { markdownFormatter } from "./markdown.js";
import { jsonFormatter } from "./json.js";

export { markdownFormatter } from "./markdown.js";
export { jsonFormatter } from "./json.js";

const formatters: Record<OutputFormat, Formatter> = {
  markdown: markdownFormatter,
  json: jsonFormatter,
};

export function getFormatter(format: OutputFormat): Formatter {
  return formatters[format];
}
