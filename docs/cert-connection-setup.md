# Connecting the Certificates app (owner setup)

This lets the PZ Academy site show certificates from the Certificates app (cert.pharmacozyme.com). You do this once. It takes about 15 minutes.

You will make a new, read-only key. It can only look at certificates. It cannot change anything.

> **Warning.** Never use the full-power key in the "Firebase Service key" folder for this. Never paste any key into a chat, an email, a document, or GitHub. Never commit it. Only the steps below are safe.

## Steps

1. Open Google Cloud Console (console.cloud.google.com). At the top, pick the project that belongs to the Certificates app (the Firebase project behind cert.pharmacozyme.com).
2. In the left menu go to **IAM & Admin**, then **Service Accounts**.
3. Click **Create service account**. Give it a name such as `academy-cert-reader`. Click **Create and continue**.
4. Under "Grant this service account access to project", choose the role **Cloud Datastore Viewer**. Add only this one role, nothing else. Click **Done**.
5. Click the new account in the list. Open the **Keys** tab. Click **Add key**, then **Create new key**, choose **JSON**, and click **Create**. A JSON file downloads to your computer.
6. Turn the file into one line of text. Open Windows PowerShell and run this, with your own file path in place of the example:

   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json"))
   ```

   It prints one long line of letters and numbers. Copy all of it.
7. Add it to your local site. Open the file `.env.local` in the project folder and add this line, pasting the long text after the equals sign:

   ```
   CERT_FIREBASE_SERVICE_ACCOUNT_JSON=paste-the-long-text-here
   ```
8. Add it to the live site. In Vercel, open the project, go to **Settings**, then **Environment Variables**. Add a variable named `CERT_FIREBASE_SERVICE_ACCOUNT_JSON` with the same long text. Tick **Production** and **Preview**. Save.
9. Redeploy so it takes effect. In Vercel, go to **Deployments**, open the latest one, and choose **Redeploy**.
10. Delete the downloaded JSON file from your computer, and empty the Recycle Bin. You no longer need it.

## How to check it worked

1. Sign in to the site as admin.
2. Click **Certificates** in the side menu. You should see a list of certificates.
3. Open any student from **Students**. On their record, open the **Certificates** tab. You should see that student's certificates.

If it is not connected, you will see this message instead:

`We could not reach the Certificates app. Try again in a minute.`

If you see it, check that the variable name is spelled exactly right, that you redeployed after adding it, and that the pasted text is one unbroken line.

Students see their certificates only after they have confirmed their email.

## What this connection can and cannot do

- It is **read-only**. It can look at certificates.
- It **cannot change or delete** certificates.
- Certificates are still made only in the Certificates app, as before.
