import { TransientPrompt } from "../ui/Prompt";

export function Footer() {
  return (
    <footer className="pt-4">
      <TransientPrompt command="exit 0" />
    </footer>
  );
}
