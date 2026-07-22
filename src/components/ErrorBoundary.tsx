import { Component, type ErrorInfo, type ReactNode } from "react";
import { useEditorStore } from "../store/editorStore";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Prevents a render crash from leaving a blank white page. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full grid place-items-center bg-[#15161b] text-neutral-200 p-8">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-lg font-medium">Algo correu mal</h1>
            <p className="text-sm text-neutral-400">
              {this.state.error.message || "Erro inesperado na interface."}
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-accent text-white text-sm"
              onClick={() => {
                this.setState({ error: null });
                useEditorStore.getState().reset();
              }}
            >
              Voltar ao início
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
