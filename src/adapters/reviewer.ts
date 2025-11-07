import execa from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ReviewResult } from '../types';

export class ReviewerAdapter {
  constructor(private config: Config) {}

  async review(diff: string, prInfo: { owner: string; repo: string; number: number }): Promise<ReviewResult> {
    // Check if diff is too small (only whitespace or comments)
    if (this.isTrivialChange(diff)) {
      return {
        content: '',
        skipped: true,
        reason: 'Trivial change (whitespace/comments only)'
      };
    }

    // Create temp files for input and output
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-review-'));
    const diffPath = path.join(tmpDir, 'diff.txt');
    const promptPath = path.join(tmpDir, 'prompt.txt');
    const outputPath = path.join(tmpDir, 'review.md');

    try {
      // Prepare the review prompt
      const prompt = this.createReviewPrompt(diff, prInfo);
      fs.writeFileSync(promptPath, prompt, 'utf-8');

      // Call Claude API
      await this.callClaudeAPI(promptPath, outputPath);

      // Read the review result
      const content = fs.readFileSync(outputPath, 'utf-8');

      return {
        content,
        skipped: false
      };
    } catch (error: any) {
      console.error('Review failed:', error.message);
      throw error;
    } finally {
      // Cleanup temp files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  private async callClaudeAPI(inputPath: string, outputPath: string): Promise<void> {
    try {
      await execa('claude', [
        'api',
        'chat',
        '--model',
        this.config.claudeModel,
        '--input-file',
        inputPath,
        '--output-file',
        outputPath,
        '--max-tokens',
        this.config.maxTokens.toString()
      ]);
    } catch (error: any) {
      console.error('Claude API call failed:', error.message);
      throw error;
    }
  }

  private createReviewPrompt(diff: string, prInfo: { owner: string; repo: string; number: number }): string {
    return `あなたは保守性とセキュリティに厳格なシニアエンジニアです。

以下のPull Requestの差分を読み、安全性・可用性・性能・可読性の観点でレビューしてください。

**リポジトリ:** ${prInfo.owner}/${prInfo.repo}
**PR番号:** #${prInfo.number}

必ず以下の項目について確認してください:

1. **重大リスク** - 本番環境での障害につながる可能性のある問題
2. **バグ/境界ケース** - エッジケースやnull/undefined処理の不備
3. **セキュリティ/漏洩** - XSS、SQLインジェクション、認証/認可、機密情報の漏洩など
4. **可用性/レイテンシ** - パフォーマンス問題、N+1クエリ、メモリリークなど
5. **テスト不足** - テストされていない重要なロジック
6. **提案パッチ** - 具体的な改善コード例（短いコード断片）

各指摘には根拠となる差分行を引用してください。
出力はGitHub Markdown形式のみで、簡潔かつ具体的に記述してください。

---

**差分:**

\`\`\`diff
${diff}
\`\`\`

---

レビュー結果を出力してください:`;
  }

  private isTrivialChange(diff: string): boolean {
    const lines = diff.split('\n');
    let meaningfulChanges = 0;

    for (const line of lines) {
      // Skip diff headers
      if (line.startsWith('diff --git') ||
          line.startsWith('index ') ||
          line.startsWith('---') ||
          line.startsWith('+++') ||
          line.startsWith('@@')) {
        continue;
      }

      // Check for actual code changes (not just whitespace)
      if (line.startsWith('+') || line.startsWith('-')) {
        const content = line.substring(1).trim();

        // Skip empty lines
        if (content.length === 0) continue;

        // Skip comment-only lines
        if (content.startsWith('//') ||
            content.startsWith('/*') ||
            content.startsWith('*') ||
            content.startsWith('#')) {
          continue;
        }

        meaningfulChanges++;
      }
    }

    // Consider it trivial if fewer than 5 meaningful changes
    return meaningfulChanges < 5;
  }
}
