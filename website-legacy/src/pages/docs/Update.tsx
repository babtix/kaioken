import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, Steps, UL } from "@/components/docs/parts"

export default function Update() {
  return (
    <DocPage
      title="Incremental updates"
      lead="A full wiki run is expensive. Once one has completed, update works from a git diff and revises only the documents the change invalidates."
    >
      <H2 id="how">How it works</H2>
      <Steps
        items={[
          <>
            <C>git diff &lt;baseline&gt;</C> against the <strong>working tree</strong> — committed,
            staged, unstaged and untracked changes all count, because the docs describe the code on
            disk, not just what was committed.
          </>,
          <>
            Changed files are mapped to documents via the <strong>provenance footer</strong> every
            generated document carries (<C>{"<!-- kaioken:files … -->"}</C>), which records the
            exact sources it was written from. A section&apos;s own document additionally matches
            its planned file scope, so a brand-new file — which appears in no existing
            document&apos;s provenance — still gets documented.
          </>,
          <>
            Each affected document is revised in one pass that receives the{" "}
            <strong>existing document + the diff + the current file contents</strong> — a revision,
            not a rewrite, so structure, diagrams and still-accurate prose survive.
          </>,
          <>
            A dated entry lands in <C>.kaioken/wiki/CHANGELOG.md</C>, and the baseline moves to the
            new commit.
          </>,
        ]}
      />

      <Callout kind="note" title="Provenance over prose">
        Documents record their sources in a machine-readable footer, so incremental updates do not
        depend on the model writing a tidy <em>Referenced Files</em> section. Documents predating
        the footer fall back to scanning that list.
      </Callout>

      <H2 id="usage">Usage</H2>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken update                 # since the recorded baseline
kaioken update -base HEAD~10   # or an explicit commit / tag / expression
kaioken hook install           # or: refresh automatically after every commit`}
        />
      </div>
      <P>
        Files no section claims are reported rather than silently ignored — that usually means the
        plan needs a <C>-force</C> re-plan to cover a new area.
      </P>

      <H2 id="hook">The commit hook</H2>
      <P>
        <C>hook install</C> appends a delimited block to <C>.git/hooks/post-commit</C>, so an
        existing hook is preserved. <C>hook remove</C> strips just that block back out.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="tui"
          code={`/hook install
/hook remove`}
        />
      </div>

      <H2 id="scope">What it refreshes</H2>
      <UL>
        <LI>Wiki chapters whose provenance includes a changed file.</LI>
        <LI>
          Section documents whose planned file scope covers a new file, so new areas are not
          orphaned.
        </LI>
        <LI>
          Skills whose <C>sources</C> list the changed files.
        </LI>
        <LI>
          Not yet knowledge cards — diff-driven card updates are on the roadmap. Cards stay
          incremental through content hashes instead.
        </LI>
      </UL>

      <H2 id="state">Where the baseline lives</H2>
      <P>
        <C>.kaioken/wiki_state.yaml</C> records the commit the wiki reflects, plus any sections that
        failed so <C>/wiki retry</C> can regenerate only those.
      </P>
    </DocPage>
  )
}
