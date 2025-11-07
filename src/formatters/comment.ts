import { Config } from '../types';

export class CommentFormatter {
  constructor(private config: Config) {}

  format(prNumber: number, sha: string, reviewContent: string): string {
    const header = this.config.commentHeader;
    const timestamp = new Date().toISOString();

    return `${header} 自動レビュー

- **PR:** #${prNumber}
- **最新SHA:** \`${sha.substring(0, 7)}\`
- **レビュー日時:** ${timestamp}

---

## レビュー結果

${reviewContent}

---

<details>
<summary>ℹ️ このコメントについて</summary>

このコメントはAIによって自動生成されました。
誤りや見落としがある可能性があります。
重要な指摘については人間のレビュアーによる確認をお勧めします。

</details>

_このコメントは自動投稿です。_
`;
  }

  formatError(prNumber: number, sha: string, error: string): string {
    const header = this.config.commentHeader;

    return `${header} レビューエラー

- **PR:** #${prNumber}
- **SHA:** \`${sha.substring(0, 7)}\`

レビュー処理中にエラーが発生しました:

\`\`\`
${error}
\`\`\`

_このコメントは自動投稿です。_
`;
  }

  formatSkipped(prNumber: number, sha: string, reason: string): string {
    const header = this.config.commentHeader;

    return `${header} レビュースキップ

- **PR:** #${prNumber}
- **SHA:** \`${sha.substring(0, 7)}\`

レビューをスキップしました: ${reason}

_このコメントは自動投稿です。_
`;
  }
}
