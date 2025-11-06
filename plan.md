# 目的

GitHubの複数リポジトリに対し、未レビューのPRへAIレビュー結果を自動でコメントする。

* 入力: `repos.txt` または Web UI で選択したリポジトリ集合
* 条件: 「自分のGitHubアカウント名のコメントが**最新コミット以降**に存在しないPR」のみ対象
* 実行: 指定のレビューコマンド（Claude Code/他）を非対話で実行し、結果をPRにコメント投稿
* 配布形態: `npx` 実行可能なCLI（`defit`風）。初回/任意でローカルWeb UIを起動し一括選択を支援
* 運用: 10分間隔の非対話モードでの巡回実行を想定（cron/常駐）

---

# 要件

## 機能要件

1. PR収集

   * モードA: `repos.txt`の各`owner/repo`からオープンPR一覧取得
   * モードB: Web UIで`org全体`/`特定ユーザー`/`複数repo`を選択→選択結果をローカル永続化
2. コメント有無の判定

   * 対象PRの最新コミットSHAとタイムスタンプ取得
   * 自アカウント名でのPRコメント/レビューコメント/スレッドが【最新コミット以降】に**存在しない**かチェック
3. AIレビュー実行

   * 変更差分・PRメタ情報をローカルに取得
   * 既定のレビューコマンド（例: `cc review` 等）を**非対話**で実行
   * 出力をフォーマットし、PRにコメント投稿
4. スキップ/重複防止

   * 実行履歴キャッシュ（PR番号＋最新SHA＋コメント済みフラグ）により再投稿を防止
5. Web UI（任意）

   * `npx pr-ai-reviewer web` でローカルUI起動
   * Organization/User/Repository/ブランチ/PR範囲をGUIで指定→ローカルに保存
6. ローカル永続化

   * 設定: `~/.pr-ai-reviewer/config.json`
   * 選択: `~/.pr-ai-reviewer/selections.json`
   * キャッシュ: `~/.pr-ai-reviewer/cache.sqlite`（sqlite）

## 非機能要件

* 踏み台不要・ローカルのみで完結（`gh` CLI、`git`、SSH/トークン利用）
* 1回の巡回で100PR程度を数分以内
* 冪等性: 同じ入力に対し副作用が増えないこと
* 観測性: 実行ログ（INFO/ERROR）、結果サマリ

## 前提/依存

* Node.js 20+
* GitHub CLI（`gh`）とPAT/Device Auth済み
* `git`/SSH Agent
* Claude Code（例: `cc` CLI）または任意のレビューコマンド（ラッパ可能）

---

# アーキテクチャ

```
[npx CLI] ──┐
             │ spawn
[Web UI] ────┤→ Controller (Fastify/Express)
             │   ├─ GitHubAdapter (gh api)
             │   ├─ GitAdapter (git ls/diff)
             │   ├─ ReviewerAdapter (cc/non-interactive)
             │   ├─ Store: config/selections/cache.sqlite
             │   └─ CommentFormatter
             └→ Scheduler (10分毎巡回: cron例示)
```

* CLI: `commander`でサブコマンド実装
* Web UI: Fastify + Vite/React(SPA)。UIは選択→保存のみ。重い処理はCLI本体が行う
* Adapter層: 外部コマンド呼び出しを1箇所に集約
* Store: 設定・選択・キャッシュを責務分離

---

# データモデル

## `config.json`

```json
{
  "githubUsername": "your-name",
  "githubTokenEnv": "GITHUB_TOKEN",
  "reviewCommand": "cc review --no-interactive --format markdown",
  "maxConcurrent": 4,
  "commentHeader": "[AI Review Bot]",
  "ownerAllowlist": ["org-a"],
  "repoBlocklist": ["org-a/legacy-repo"]
}
```

## `selections.json`

```json
{
  "mode": "org|user|list",
  "orgs": ["org-a"],
  "users": ["alice"],
  "repos": ["owner1/repo1", "owner2/repo2"]
}
```

## `cache.sqlite`（例）

* `runs(id, started_at, finished_at, status)`
* `pr_cache(owner, repo, pr_number, latest_sha, my_comment_after_sha BOOLEAN, last_checked_at)`

---

# CLI 仕様

## 実行モードの基本方針

* `npx pr-ai-reviewer` を **単体で実行した場合**、以下の自動フローを取る：

  1. `~/.pr-ai-reviewer/config.json` と `selections.json` を探索
  2. **存在しなければ自動生成**（初期状態）
  3. 自動で **Web UI** を起動し、設定画面を案内（ローカルサーバ）
  4. Web UI で設定が保存されたら、CLI は **自動的に巡回モードへ移行**
  5. 以降、**10分に1回** GitHub API 制限を考慮しながら巡回レビュー

* 巡回中の CLI は常に `config.json` と `selections.json` を **再読み込み** し、設定変更に追従する。

* Web UI を閉じても CLI は動作し続ける。CLI を終了したら巡回も停止する。

## レビュー対象フィルタリング

* Web UI 上で **レビュー対象の範囲** を指定可能：

  1. **自分が作成した PR のみ** をレビュー対象にする
  2. **自分以外が作成した PR のみ** を対象にする
  3. **すべての PR** を対象にする

* CLI は GitHub API (`gh api user`) により **自アカウントの GitHub user.id** を取得し、対象条件を判定する。

## API レート制限配慮

* 巡回時に GitHub API の ** rate-limit 残量** を先に取得し、残量に応じて：

  * 巡回頻度を一時的に **間引く**
  * PR 取得範囲を **部分的に縮小**
  * 上限超過時は **スキップして次回まで待機**

## 実行中ステータスの外部可視化

* CLI は `~/.pr-ai-reviewer/status.json` を 5 秒ごとに更新：

```json
{
  "mode": "running|waiting|error",
  "lastRunStartedAt": "2025-11-06T07:15:00Z",
  "currentTask": {
    "repo": "owner/repo",
    "pr": 14,
    "step": "reviewing | diff | commenting | waitingRateLimit",
    "index": 1,
    "total": 10
  }
}
```

* Web UI はこの status.json を **ポーリング表示** して、進捗を可視化。

## ディレクトリ構成の更新

* 全処理用のルートパス:

```
~/.pr-ai-reviewer/
  config.json
  selections.json
  cache.sqlite
  status.json
  clones/
    owner__repo1/
    owner__repo2/
```

* 各リポジトリは `clones/<owner>__<repo>/` に **shallow clone** し、レビュー都度 `git fetch` のみ実行。

## Claude (レビュー実行) 呼び出し設計

* **`cc` コマンドではなく**、実体に合わせて：

```
claude api chat \
  --model claude-3-opus \
  --input-file /tmp/diff.txt \
  --output-file /tmp/review.md \
  --max-tokens 4000
```

* Adapter 層にて **モデル差し替え可能** にする。
* 実行例:

```ts
await execa('claude', [
  'api','chat',
  '--model', cfg.model,
  '--input-file', diffPath,
  '--output-file', outPath,
  '--max-tokens', cfg.maxTokens
])
```

## Web UI 画面仕様（簡潔）

### 1. トップ画面

* 現在の CLI 状態表示（待機 / 処理中 / エラー）
* 今の進捗バー（PR 10件中 3件処理中など）

### 2. 設定画面

* GitHub アカウント確認
* レビュー対象範囲（自分のみ / 他人のみ / 全部）
* 巡回間隔（デフォルト10分、最小5分、最大60分）
* API 制限時の挙動設定

### 3. リポジトリ選択画面

* Org / User / Repository の検索と複数選択
* 保存すると `selections.json` へ反映

### 4. 実行状況画面

* `status.json` の内容をテーブル表示
* 総PR数 / 現在のPR番号 / 進行ステップ

---

## 最終期待する動作

1. `npx pr-ai-reviewer` → UIが開く
2. UIで設定とリポジトリ選択
3. UIを閉じても CLI はバックグラウンド巡回
4. 設定を変えたら即反映
5. レビューは Claude 非対話呼び出し
6. Web UI では常に進行状況が見える

```
# 初期設定
npx pr-ai-reviewer init                 # configとcacheを生成
npx pr-ai-reviewer auth                 # gh auth状態検査、cc存在検査

# 選択
npx pr-ai-reviewer web                  # ローカルUI起動（デフォルト: http://127.0.0.1:4567）

# バッチ実行（非対話）
npx pr-ai-reviewer run --from-repos ./repos.txt
npx pr-ai-reviewer run --use-selections  # selections.jsonを利用

# ドライラン／対象確認
npx pr-ai-reviewer list-targets --from-repos ./repos.txt

# キャッシュ
npx pr-ai-reviewer cache clear
```

### `repos.txt` 例

```
actindi/outing
vercel/next.js
```

---

# 判定ロジック詳細

1. PR一覧取得

   * `gh pr list --repo owner/repo --state open --json number,headRefName,updatedAt`
2. 最新コミット取得

   * `gh pr view <num> --repo owner/repo --json commits` → 末尾コミットの`oid`と`committedDate`
3. 自コメント検索

   * `gh api repos/:owner/:repo/issues/:num/comments`（Issueコメント）
   * `gh api repos/:owner/:repo/pulls/:num/comments`（Reviewコメント）
   * 著者 == `config.githubUsername`
   * `created_at` or `updated_at` が `latestCommit.committedDate` 以降か
4. 未コメントの場合のみ対象に追加

---

# レビュー実行フロー

```
対象PR → git fetch (shallow) → diff取得 → ReviewerAdapterへ入力 → 出力(markdown)
      → CommentFormatter（見出し/折り畳み/署名）→ gh pr comment で投稿
```

* diffは`gh pr diff`または`git diff origin/<base>...origin/<head>`で取得
* 大規模差分は分割（ファイルごと/チャンクごと）で複数コメントに分ける

---

# ReviewerAdapter（Claude Code 例）

## 非対話CLI呼び出し例

```
cc review \
  --no-interactive \
  --input /tmp/pr-<num>-diff.txt \
  --max-tokens 4000 \
  --format markdown \
  --out /tmp/pr-<num>-review.md
```

## プロンプト（テンプレ・骨子）

> あなたは保守性とセキュリティに厳格なシニアエンジニアです。以下の差分を読み、**安全性・可用性・性能・可読性**の観点でレビューしてください。必ず、
>
> 1. 重大リスク
> 2. バグ/境界ケース
> 3. セキュリティ/漏洩
> 4. 可用性/レイテンシ
> 5. テスト不足
> 6. 提案パッチ（短いコード断片）
>    を短く箇条書きで。各指摘には**根拠となる差分行**を引用してください。出力はGitHub Markdownのみ。

* レビューノイズ抑制: 小変更（コメント/整形）のみのPRは「スキップ」を返す
* トークン制約: ファイルごとにプロンプトを分割→最後に集約

---

# 投稿フォーマット

```
[AI Review Bot] 自動レビュー

- PR: #<num>
- 最新SHA: <sha>

<要約>

<詳細レビュー（folding）>

_このコメントは自動投稿です。誤りがあれば `/ai-review rerun` をコメントしてください。_
```

---

# エラーハンドリング

* GitHub API 429/5xx: 指数バックオフ＋再試行（最大3回）
* `cc`失敗: リトライ1回→失敗時はPRに「レビュー不可の理由」をメモ（オプション）
* 差分巨大: 対象ファイルの上限・除外パターン設定

---

# セキュリティ

* トークンは環境変数のみ→`config.json`には保存しない
* ログにPII/トークン/パスを出力しない
* Web UI は `localhost` バインド、CSRFトークン付与

---

# パフォーマンス/並列化

* `maxConcurrent` でPR単位の並列度を制御
* `gh`呼び出しのN+1抑制（GraphQL/一括APIも検討）

---

# 運用（10分ごと非対話）

## cron例

```
*/10 * * * *  PATH=$HOME/.local/bin:$PATH \
  GITHUB_TOKEN=xxxxx npx pr-ai-reviewer run --use-selections >> ~/.pr-ai-reviewer/runner.log 2>&1
```

---

# リリース計画

1. MVP: `repos.txt` + 非対話`run` + コメント判定 + 単発レビュー投稿
2. Web UI: 選択保存のみ
3. 並列化/巨大PR分割
4. GraphQL最適化/メトリクス

---

# 疑似コード（コア）

```ts
async function processRepo(ownerRepo) {
  const prs = await ghListOpenPRs(ownerRepo)
  for (const pr of prs) {
    const { latestSha, latestDate } = await ghLatestCommit(ownerRepo, pr.number)
    const hasMyComment = await ghHasMyCommentAfter(ownerRepo, pr.number, latestDate, cfg.githubUsername)
    if (hasMyComment) continue

    const diff = await getDiff(ownerRepo, pr.number)
    const review = await runReviewer(diff, cfg)
    const body = formatComment(pr, latestSha, review)
    await ghPostComment(ownerRepo, pr.number, body)
    await cacheMarkCommented(ownerRepo, pr.number, latestSha)
  }
}
```

---

# Claude Code 向け `plan.md`

## ゴール

* `npx pr-ai-reviewer` として動作する最小実装を3ステップで完成
* 10分間隔の非対話巡回を可能にする

## 制約

* Node.js 20+ / `gh` / `git` 前提
* 外部通信はGitHub/モデルAPIのみ

## 手順

### 1. スケルトン生成

* 生成物

  * `package.json`（`bin: pr-ai-reviewer`）
  * `src/cli.ts`（commander）
  * `src/adapters/{github,git,reviewer}.ts`
  * `src/store/{config,selections,cache}.ts`
  * `src/run.ts`（エントリ）
  * `web/`（Vite+React雛形）
* コマンド

  * `npm init -y`
  * `npm i commander execa fastify better-sqlite3 zod`
  * `npm i -D typescript ts-node @types/node @types/commander`
  * `npx tsc --init`

### 2. GitHubアダプタ実装

* `gh pr list/view/api` の薄いラッパ + JSONパーサ
* 単体テスト: モックでPR→最新SHA→コメント有無の3関数

### 3. Reviewerアダプタ（Claude Code）

* `cc review --no-interactive` を`execa`で呼び出し
* diff分割と出力連結（上限考慮）

### 4. コメント投稿/フォーマッタ

* Markdownテンプレ + 折り畳み記法

### 5. Web UI（最小）

* Org/User/Repo選択→`selections.json`書き込みAPI

### 6. ランナー/cron

* `run --use-selections` の冪等動作確認

## テスト計画

* ユニット: Adapter/Formatter/Store
* 結合: リポジトリに対するドライラン（`list-targets`が安定）
* 手動E2E: テスト用PRを作成して投稿確認

## ロールバック

* コメント本文に署名→`gh issue delete-comment`で取り消し可能

## Claude Code 用プロンプト例

> 目的: `npx pr-ai-reviewer` のMVPを段階的に作る。あなたはTypeScriptとCLI設計に長けたシニアです。以下の仕様に沿って、**実行可能な最小コード**を出力し、次のアクションを常に提示してください。出力は「変更ファイル一覧→各ファイルの完全な内容→実行手順」の順。
>
> 優先順位: 1) GitHubアダプタ 2) CLI `run` 3) Reviewerラッパ 4) 投稿
>
> 制約: Commander/Execa/Zod/Better-sqlite3のみ使用。ESM禁止。Node20。

## 非対話オプション

* `cc review --no-interactive` を強制
* CLIにも `--non-interactive` を追加（Web UI機能を無効化）

## 完了の定義

* `npx . run --from-repos ./repos.txt` が動作し、未コメントPRへ1件以上投稿

---

# 参考メモ

* 将来: GitHub GraphQLで一括取得、PRイベントWebhookのポーリング対応
* セルフホスト支援: Dockerfileで`gh`/`git`/`cc`を同梱したRunner
