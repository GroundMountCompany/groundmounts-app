"use client";
import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, info: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ERROR_BOUNDARY]", msg, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm">
          Something went wrong. Please refresh and try again.
        </div>
      );
    }
    return this.props.children;
  }
}