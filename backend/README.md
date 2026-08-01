# Backend de CCG Flow

## Intallaion de Mail dev

Pour pouvoir envoyer les mail en local, il faut:

```bash
# 1. Installer lMailDev
npm install -g maildev

# 2. lancer le maildev 
maildev
```

Cela lance :

- un serveur SMTP sur localhost:1025
- une interface web sur http://localhost:1080 pour voir les mails reçus

Dans le fichier .env, settez les variable suivantes
```
fichier .env

SMTP_HOST=localhost
SMTP_PORT=1025
```

