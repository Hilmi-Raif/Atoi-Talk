import { Component, type ReactNode } from "react";

type Props = { open: boolean; children: ReactNode };

export class ExitContent extends Component<Props, { children: ReactNode }> {
  state = { children: this.props.children };

  static getDerivedStateFromProps(props: Props, state: { children: ReactNode }) {
    return props.open ? { children: props.children } : state;
  }

  render() {
    return this.state.children;
  }
}
