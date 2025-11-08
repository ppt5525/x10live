name: X10Hosting Keepalive

on:
  schedule:
    - cron: '0 8 */15 * *'
  workflow_dispatch: true

jobs:
  login:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm install
          npx playwright install chromium

      - name: Run X10Hosting login script
        env:
          BOT_TOKEN: ${{ secrets.BOT_TOKEN }}
          CHAT_ID: ${{ secrets.CHAT_ID }}
          ACCOUNTS: ${{ secrets.ACCOUNTS }}
        run: node x10login.js
