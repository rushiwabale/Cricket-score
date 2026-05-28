# Village Cricket Scorer

Simple cricket scoring app with a Node/Express API and MySQL storage.

## Local Setup

1. Copy environment variables:

```sh
cp .env.example .env
```

2. If using the included Docker MySQL, set a local password in `.env`:

```sh
MYSQL_PASSWORD=your-local-password
```

3. Start MySQL:

```sh
docker compose up -d
```

4. Start the app:

```sh
npm start
```

5. Open:

```txt
http://localhost:3000
```

The server creates the database/table automatically. A match URL includes `?match=...`, so refreshing or sharing that URL loads the saved score from MySQL.

## Deploy Notes

Set these environment variables on your hosting provider:

```txt
PORT
MYSQL_HOST
MYSQL_PORT
MYSQL_USER
MYSQL_PASSWORD
MYSQL_DATABASE
```

Use `npm start` as the start command.
