import type { FlowchartNode, FlowchartStage } from '../../types/flowchart';
import { processInlineKatex } from '../../utils/katex';
// NodeCard shares the canonical node styling with FlowchartRenderer so the
// read-only viewer and the editor never visually drift. The styles rely on
// descendant combinators (e.g. `.selected .depthBadge`), so both consumers
// import the same CSS module rather than duplicating classes.
import styles from '../FlowchartRenderer/FlowchartRenderer.module.css';

export interface NodeCardProps {
  node: FlowchartNode;
  /** Stage colors, already resolved for the active theme (light/dark). */
  colors: FlowchartStage['colors'];
  /** Extra class(es) composed onto the node, e.g. highlight/selection state. */
  className?: string;
  /** Inline style overrides merged after positioning/colors. */
  style?: React.CSSProperties;
  /** Text for the floating depth badge (empty string hides it via CSS). */
  depthBadge?: string;
  /** Ref to the node element (used for arrow anchor measurement). */
  innerRef?: (el: HTMLDivElement | null) => void;
  /** Overlay content rendered inside the node (action buttons, handles…). */
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

/**
 * Presentational flowchart node: absolutely positioned card with title,
 * divider, refs and topics. Pure — no selection/highlight logic of its own;
 * consumers pass state via `className` and overlays via `children`.
 */
export function NodeCard({
  node,
  colors,
  className,
  style,
  depthBadge = '',
  innerRef,
  children,
  onClick,
  onMouseDown,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: NodeCardProps) {
  return (
    <div
      ref={innerRef}
      data-node-id={node.id}
      className={`${styles.node}${className ? ` ${className}` : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        background: colors.background,
        border: `1.2px solid ${colors.border}`,
        ...style,
      }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.depthBadge}>{depthBadge}</div>

      {children}

      <div
        className={styles.nodeTitle}
        style={{ color: colors.title }}
        dangerouslySetInnerHTML={{ __html: processInlineKatex(node.title) }}
      />

      <div className={styles.nodeDivider} style={{ background: colors.divider }} />

      {node.refs && (
        <div
          className={styles.nodeRefs}
          style={{ color: colors.refs }}
          dangerouslySetInnerHTML={{ __html: processInlineKatex(node.refs) }}
        />
      )}

      {node.topics && (
        <div
          className={styles.nodeTopics}
          style={{ color: colors.topics }}
          dangerouslySetInnerHTML={{ __html: processInlineKatex(node.topics) }}
        />
      )}
    </div>
  );
}
