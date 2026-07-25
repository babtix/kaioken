package wiki

import (
	"context"
	"fmt"
	"strings"
)

// Above ×3 the multiplier used to buy nothing but a bigger line-count target,
// which makes documents longer rather than better. It now buys PASSES:
//
//	×4+  self-critique and revise — score the draft against a rubric, then fix
//	     the specific gaps it names
//	×10  additionally correct grounding failures the verifier found
//
// Each level roughly doubles the calls per document, which is what a
// power-multiplier metaphor ought to mean.
const (
	critiqueMultiplier = 4
	verifyMultiplier   = 10
)

const critiqueSystem = `You are reviewing a draft chapter of a repository wiki against the
sources it was written from. You are a demanding technical reviewer: your job is to find what
is missing, wrong, or padded.

Check, in order:
1. COVERAGE — is every exported/public declaration in the STRUCTURE block either documented
   or deliberately grouped? List anything significant that is simply absent.
2. ACCURACY — does any statement contradict the sources? Are any files, functions, types or
   behaviors mentioned that the sources do not contain?
3. PADDING — is anything repeated, restated, or filled with generic prose that would read the
   same for any codebase? Vague filler is a defect.
4. CONCRETENESS — are claims tied to real names and real anchors, or hand-waved?
5. STRUCTURE — is the table of contents accurate, are diagrams valid and useful, are
   enumerable things in tables?

Then output the COMPLETE revised chapter with those problems fixed. Preserve everything that
was already correct — this is a revision, not a rewrite. Cut padding rather than adding to it;
the revision may well be shorter.

Output ONLY the revised markdown chapter. No review notes, no commentary, no JSON.`

const correctSystem = `You are correcting factual errors in a chapter of a repository wiki.

An automated check compared the chapter's claims against the actual code index and found the
listed items unverifiable: files that do not exist, symbols that are declared nowhere, line
anchors past the end of a file, or quoted code that does not appear where it claims to.

For EACH listed problem, do one of:
- Replace it with the correct name, path or anchor if the sources show what was meant.
- Rewrite the sentence to describe the behavior WITHOUT the unverifiable claim.
- Delete the claim if it cannot be supported at all.

Do NOT invent replacements. Do not change anything the check did not flag. Preserve the
document's structure, headings, tables and diagrams exactly.

Output ONLY the complete corrected markdown chapter.`

// critique runs a review-and-revise cycle over a draft.
func (r *run) critique(ctx context.Context, req docRequest, draft string) (string, error) {
	var user strings.Builder
	fmt.Fprintf(&user, "Chapter under review: %s\n\nIts goal was:\n%s\n\n", req.Title, req.Goal)
	user.WriteString("===== DRAFT =====\n")
	user.WriteString(draft)
	user.WriteString("\n\n===== THE SOURCES IT WAS WRITTEN FROM =====\n")
	user.WriteString(bundleFiles(r.idx, req.Files, req.Title+" "+req.Goal, r.cfg.MaxModuleTokens))

	revised, err := r.client.Chat(ctx, critiqueSystem, user.String())
	if err != nil {
		return "", err
	}
	revised = unfence(revised)
	// A revision that collapses the document is a failed pass, not an
	// improvement — keep the draft rather than shipping a stub.
	if len(revised) < len(draft)/3 {
		return "", fmt.Errorf("revision collapsed the document (%d → %d chars); keeping the draft",
			len(draft), len(revised))
	}
	return revised, nil
}

// correct repairs the specific claims grounding verification rejected.
func (r *run) correct(ctx context.Context, req docRequest, draft string, rep Report) (string, error) {
	var user strings.Builder
	fmt.Fprintf(&user, "Chapter: %s\n\n", req.Title)
	user.WriteString("Unverifiable claims found by the automated check:\n")
	user.WriteString(rep.Detail(40))
	user.WriteString("\n===== CHAPTER =====\n")
	user.WriteString(draft)
	user.WriteString("\n\n===== THE ACTUAL SOURCES =====\n")
	user.WriteString(bundleFiles(r.idx, req.Files, req.Title+" "+req.Goal, r.cfg.MaxModuleTokens))

	fixed, err := r.client.Chat(ctx, correctSystem, user.String())
	if err != nil {
		return "", err
	}
	fixed = unfence(fixed)
	if len(fixed) < len(draft)/3 {
		return "", fmt.Errorf("correction collapsed the document; keeping the original")
	}
	return fixed, nil
}
