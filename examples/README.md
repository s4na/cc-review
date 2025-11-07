# Examples

## GitHub Actions CI Workflow

`github-actions-ci.yml` - GitHub Actionsワークフローの設定ファイル例

このファイルを使用するには、リポジトリの `.github/workflows/` ディレクトリに配置してください。

```bash
# 手動でワークフローを追加する方法
mkdir -p .github/workflows
cp examples/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Add GitHub Actions CI workflow"
git push
```

**注意**: GitHub Appの権限制約により、自動的にワークフローファイルを
プッシュできない場合があります。その場合は、適切な権限を持つユーザーが
手動でファイルを追加する必要があります。

## その他の例

### repos.txt

リポジトリリストの例は `repos.txt.example` を参照してください。
