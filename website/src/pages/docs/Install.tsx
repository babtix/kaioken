import CodeBlock from "@/components/CodeBlock"
import { C, Callout, DocPage, H2, LI, P, Steps, UL } from "@/components/docs/parts"
import { GITHUB_URL } from "@/data/content"

export default function Install() {
  return (
    <DocPage
      title="Install"
      lead="Kaioken is a single Go binary. Build it, export a key, and run it inside the repository you want to work on."
    >
      <H2 id="download">Download the ready exe</H2>
      <P>
        Skip the build entirely — grab the pre-built <C>kaioken.exe</C> from{" "}
        <a
          href={`${GITHUB_URL}/releases`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-kai-orange underline decoration-kai-orange/40 underline-offset-4 transition-colors hover:text-kai-amber"
        >
          GitHub releases
        </a>{" "}
        and it&apos;s ready to use. Then it&apos;s just provider → key → model → ready to start:
      </P>
      <Steps
        items={[
          <>
            Pick a <strong className="font-semibold text-foreground">provider</strong> — OpenRouter,
            OpenAI, Groq, Together, DeepSeek, Mistral, or a local Ollama.
          </>,
          <>
            Set its API <strong className="font-semibold text-foreground">key</strong> —{" "}
            <C>$env:OPENROUTER_API_KEY = "sk-or-..."</C>, or <C>/key</C> inside the TUI.
          </>,
          <>
            Choose a <strong className="font-semibold text-foreground">model</strong> —{" "}
            <C>/models</C> lists what that provider actually offers.
          </>,
          <>
            Run <C>kaioken</C> — you&apos;re <strong className="font-semibold text-foreground">ready
            to start</strong>.
          </>,
        ]}
      />

      <H2 id="requirements">Requirements</H2>
      <UL>
        <LI>
          <C>Go ≥ 1.24</C> to build the binary.
        </LI>
        <LI>
          An API key for any OpenAI-compatible provider — OpenRouter, OpenAI, Groq, Together,
          DeepSeek, Mistral, or a local Ollama.
        </LI>
        <LI>
          A git repository, if you want <C>kaioken update</C> to work from diffs.
        </LI>
      </UL>

      <H2 id="build">Build</H2>
      <P>
        The Go source lives in <C>cli/</C>, and the site you are reading lives in <C>website/</C>.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          prompt
          code={`cd cli
go build -o kaioken.exe ./cmd/kaioken`}
        />
      </div>

      <H2 id="key">Set a key</H2>
      <P>
        Kaioken reads the key from the environment, or you can set it in-memory for a single
        session with <C>/key</C> — which opens a hidden prompt when given no value.
      </P>
      <div className="pt-4">
        <CodeBlock
          title="powershell"
          code={`# get one at openrouter.ai/keys
$env:OPENROUTER_API_KEY = "sk-or-..."`}
        />
      </div>
      <Callout kind="tip" title="Switching providers">
        Kaioken is provider-agnostic over any OpenAI-compatible endpoint. Use{" "}
        <C>/provider &lt;name&gt;</C> in the TUI to switch, then <C>/models</C> to see what that
        provider actually offers.
      </Callout>

      <H2 id="first-run">First run</H2>
      <P>
        The bare command launches the interactive TUI. Every step also exists as a subcommand for
        CI and automation.
      </P>
      <Steps
        items={[
          <>
            <C>kaioken init</C> creates <C>.kaioken/config.yaml</C> — review the model, the scope
            excludes, and the steering notes.
          </>,
          <>
            <C>kaioken scan</C> prints an inventory so you can see exactly what will be analyzed
            before spending a token.
          </>,
          <>
            <C>kaioken plan</C> has the LLM propose <C>modules.yaml</C>. Edit it — module
            boundaries are a judgment call you should own.
          </>,
          <>
            <C>kaioken generate</C> runs parallel card generation across the modules you approved.
          </>,
          <>
            <C>kaioken wiki</C> runs the deep multi-pass wiki at ×3 and records the commit it
            documents.
          </>,
        ]}
      />

      <div className="pt-6">
        <CodeBlock
          title="powershell"
          prompt
          code={`kaioken                      # bare command launches the TUI
kaioken tui -repo path\\to\\repo
kaioken models claude        # discover model ids`}
        />
      </div>

      <Callout kind="warn" title="Cost is printed up front">
        A wiki run prints its estimated calls and tokens before starting, and asks for confirmation
        past a threshold. A model id ending in <C>:free</C> caps parallelism at 2 — those tiers
        rate-limit hard.
      </Callout>

      <H2 id="website">Running this site locally</H2>
      <div className="pt-4">
        <CodeBlock title="powershell" prompt code={`cd website\nnpm install\nnpm run dev`} />
      </div>
    </DocPage>
  )
}
