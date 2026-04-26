# Obsidian Password Manager

[中文说明](./README.zh-CN.md)

> A lightweight password manager for Obsidian that helps you store accounts, passwords, and links locally, with encryption, backup, trash, and import/export support.

![Obsidian Password Manager](./assets/demo.png)

## Introduction

**Obsidian Password Manager** is a lightweight plugin for Obsidian designed to keep everyday account and password records inside your vault.

It stores data in a JSON-based structure and provides a three-pane management interface so you can switch quickly between groups, entries, and details. For common use cases such as website logins, software credentials, and simple key records, this workflow stays lightweight and easy to manage alongside your notes.

## Features

- **Encrypted storage** – Sensitive fields such as passwords are encrypted locally with symmetric encryption, and the key remains under your control.
- **Group management** – Organize entries with custom groups such as default items, website keys, or personal profiles.
- **Fast search** – Search entries in real time by title, username, link, note, or group name.
- **Backup and restore** – Export all data as a JSON snapshot and restore it when needed.
- **Import / export** – Supports CSV and JSON formats for migration and interoperability.
- **Trash** – Deleted entries are moved to trash first, where they can be restored or permanently removed.

## Installation

### Install with BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian-brat) plugin.
2. In BRAT settings, add `https://github.com/PandaNocturne/obsidian-password-manager`.
3. Enable the plugin.

### Manual installation

- Download the latest `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/obsidian-password-manager/` inside your vault.
- Restart Obsidian and enable the plugin.

## Security notes

- This plugin does **not** send data over the network. All information is stored locally in your Obsidian vault.
- If you sync your vault with Git, make sure your `.gitignore` excludes any encryption key files if you use them, or accept that encrypted JSON data may be committed.

> If you need a full-featured professional password manager, this plugin is better treated as a lightweight local record tool rather than a complete replacement.

## Development and contribution

- Author: [PandaNocturne](https://github.com/PandaNocturne)
- Issues and pull requests are welcome.
- Local development:

```bash
git clone https://github.com/PandaNocturne/obsidian-password-manager.git
npm install
npm run dev
```

## License

[MIT](LICENSE)