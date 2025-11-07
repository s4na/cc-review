# PR AI Reviewer

GitHubの複数リポジトリに対し、未レビューのPRへAIレビュー結果を自動でコメントするツールです。

## 特徴

- 複数のGitHubリポジトリを監視
- 未レビューのPRを自動検出
- Claude APIを使用してコードレビューを実行
- レビュー結果をPRに自動コメント
- 重複投稿を防ぐキャッシュ機能
- 定期実行可能な非対話モード

## 前提条件

- Node.js 20以上
- GitHub CLI (`gh`) がインストール・認証済み
- Claude CLI がインストール済み
- Git

## インストール

```bash
npm install
npm run build
```

または、npxで直接実行:

```bash
npx pr-ai-reviewer
```

## 使い方

### 初期設定

```bash
# 設定ファイルの初期化
npx pr-ai-reviewer init

# 認証状態の確認
npx pr-ai-reviewer auth
```

設定ファイル (`~/.pr-ai-reviewer/config.json`) を編集してGitHubユーザー名などを設定してください。

### リポジトリの選択

`~/.pr-ai-reviewer/selections.json` を編集:

```json
{
  "mode": "list",
  "orgs": [],
  "users": [],
  "repos": [
    "owner/repo1",
    "owner/repo2"
  ]
}
```

または、`repos.txt` ファイルを作成:

```
owner/repo1
owner/repo2
```

### レビューの実行

```bash
# selections.jsonを使用して実行
npx pr-ai-reviewer run --use-selections

# repos.txtを使用して実行
npx pr-ai-reviewer run --from-repos ./repos.txt

# ドライラン（実際には実行しない）
npx pr-ai-reviewer run --use-selections --dry-run
```

### 対象PRの確認

```bash
# レビュー対象のPRを一覧表示
npx pr-ai-reviewer list-targets --use-selections
```

### キャッシュの管理

```bash
# キャッシュをクリア
npx pr-ai-reviewer cache clear
```

## 設定

`~/.pr-ai-reviewer/config.json`:

```json
{
  "githubUsername": "your-username",
  "githubTokenEnv": "GITHUB_TOKEN",
  "reviewCommand": "claude api chat",
  "claudeModel": "claude-3-opus-20240229",
  "maxTokens": 4000,
  "maxConcurrent": 4,
  "commentHeader": "[AI Review Bot]",
  "ownerAllowlist": [],
  "repoBlocklist": [],
  "reviewTargetFilter": "all",
  "patrolIntervalMinutes": 10,
  "webUIPort": 4567
}
```

### 設定項目

- `githubUsername`: あなたのGitHubユーザー名
- `claudeModel`: 使用するClaudeモデル
- `maxTokens`: レビューの最大トークン数
- `reviewTargetFilter`: レビュー対象のフィルタ (`own` / `others` / `all`)
  - `own`: 自分が作成したPRのみ
  - `others`: 他人が作成したPRのみ
  - `all`: すべてのPR

## 定期実行

cronで定期的に実行する例:

```bash
*/10 * * * * cd /path/to/pr-ai-reviewer && npx pr-ai-reviewer run --use-selections >> ~/.pr-ai-reviewer/runner.log 2>&1
```

## ディレクトリ構造

```
~/.pr-ai-reviewer/
  config.json          # 設定ファイル
  selections.json      # リポジトリ選択
  cache.sqlite         # 実行履歴キャッシュ
  status.json          # 実行ステータス
  clones/              # リポジトリのクローン
    owner__repo1/
    owner__repo2/
```

## ライセンス

MIT
