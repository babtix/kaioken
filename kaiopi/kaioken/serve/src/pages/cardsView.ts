import type { Site } from "./layout.ts";
import { layout, plural, shortDate, escapeHtml, escapeAttr, hrefFor, str, command, fileLink } from "./layout.ts";
import { mobileToc } from "./wikiView.ts";
import { titleFromId, type CardSummary, type Skill } from "../library.ts";
import type { Heading } from "../markdown.ts";

/* ------------------------------------------------------------ cards, skills */

export function cardsPage(site: Site): string {
	const { cards } = site.library;

	return layout(site, {
		title: "Cards",
		active: "/cards",
		body: `<h1>Knowledge cards</h1>
      <p class="lede">One compact, uniform record per module — the queryable counterpart to a
        wiki chapter.</p>
      ${
				cards.length === 0
					? `<div class="empty"><h2>No cards yet</h2>${command("kaioken plan\nkaioken cards")}</div>`
					: `<div class="grid">${cards
							.map(
								(card: CardSummary) => `<a class="card" href="${escapeAttr(card.href)}">
                  <h3>${escapeHtml(card.name)}</h3>
                  <p>${escapeHtml(card.summary.slice(0, 180))}${card.summary.length > 180 ? "…" : ""}</p>
                  <p class="muted" style="margin-top:10px;font-size:12.5px">
                    ${plural(card.entryPointCount, "entry point")}${
											card.ungrounded > 0 ? ` · ${card.ungrounded} unverified` : ""
										}
                  </p>
                </a>`,
							)
							.join("")}</div>`
			}`,
	});
}

export function cardPage(site: Site, file: string, card: Record<string, unknown>): string {
	const name = str(card["name"]) || file.replace(/\.json$/, "");
	const entryPoints = Array.isArray(card["entryPoints"]) ? card["entryPoints"] : [];
	const keyPoints = Array.isArray(card["keyPoints"]) ? card["keyPoints"] : [];
	const sources = Array.isArray(card["sources"]) ? card["sources"] : [];
	const verification = (card["verification"] ?? {}) as Record<string, unknown>;
	const ungrounded = Array.isArray(verification["ungrounded"]) ? verification["ungrounded"] : [];

	return layout(site, {
		title: name,
		active: "/cards",
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/cards">Cards</a><span>/</span><span class="mono">${escapeHtml(file)}</span>
      </nav>
      <h1>${escapeHtml(name)}</h1>
      <p class="sub">${escapeHtml(str(card["moduleId"]))}${
				card["generatedAt"] ? ` · written ${escapeHtml(shortDate(str(card["generatedAt"])))}` : ""
			}</p>
      ${str(card["summary"]) ? `<p class="prose" style="max-width:68ch">${escapeHtml(str(card["summary"]))}</p>` : ""}
      ${
				keyPoints.length > 0
					? `<h2>Key points</h2><ul class="prose">${keyPoints
							.map((point) => `<li>${escapeHtml(String(point))}</li>`)
							.join("")}</ul>`
					: ""
			}
      ${
				entryPoints.length > 0
					? `<h2>Entry points</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>File</th><th>Why start here</th></tr></thead><tbody>${entryPoints
							.map((raw) => {
								const entry = (raw ?? {}) as Record<string, unknown>;
								const path = str(entry["file"]);
								return `<tr><td class="mono">${escapeHtml(str(entry["name"]))}</td>
                  <td>${path ? fileLink(path) : ""}</td>
                  <td class="muted">${escapeHtml(str(entry["note"]))}</td></tr>`;
							})
							.join("")}</tbody></table></div>`
					: ""
			}
      ${
				ungrounded.length > 0
					? `<div class="note" style="margin-top:26px">
             <div><strong>${plural(ungrounded.length, "claim")} the structural index could not confirm.</strong>
             Reported rather than hidden: ${escapeHtml(ungrounded.slice(0, 6).map(String).join(", "))}</div>
           </div>`
					: ""
			}
      ${
				sources.length > 0
					? `<details class="panel" open><summary>Written from ${plural(sources.length, "file")}</summary>
             <ul class="rows">${sources
									.map((raw) => {
										const source = (raw ?? {}) as Record<string, unknown>;
										return `<li>${fileLink(str(source["path"]))}</li>`;
									})
									.join("")}</ul>
           </details>`
					: ""
			}`,
	});
}

export function skillsPage(site: Site): string {
	const { skills } = site.library;

	return layout(site, {
		title: "Skills",
		active: "/skills",
		body: `<h1>Skills</h1>
      <p class="lede">Written procedures for recurring tasks in this repository. Unlike everything
        else here they are handwritten — they are indexed so a procedure nobody can find does not
        become a procedure nobody follows.</p>
      ${
				skills.length === 0
					? '<div class="empty">No skills under <code>.kaioken/skills</code>.</div>'
					: `<div class="grid">${skills
							.map(
								(skill: Skill) => `<a class="card" href="${escapeAttr(skill.href)}">
                  <h3>${escapeHtml(skill.name)}</h3>
                  <p>${escapeHtml(skill.description.slice(0, 200))}${skill.description.length > 200 ? "…" : ""}</p>
                </a>`,
							)
							.join("")}</div>`
			}`,
	});
}

export function skillPage(
	site: Site,
	path: string,
	title: string,
	headings: readonly Heading[],
	html: string,
): string {
	return layout(site, {
		title,
		active: "/skills",
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/skills">Skills</a><span>/</span><span class="mono">${escapeHtml(path)}</span>
      </nav>
      <h1>${escapeHtml(title)}</h1>
      ${headings.length > 1 ? mobileToc(headings) : ""}
      <article class="prose">${html}</article>`,
	});
}
