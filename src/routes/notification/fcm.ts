import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "asha-1b031",
    clientEmail: "firebase-adminsdk-fbsvc@asha-1b031.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD537LRBIxS+ns7\nfT2alktu0uAoi9fUmfw0/CUW47KaCNl8hxMEneFOHONKtJI++Ltj/QrLqbLITbxT\nC5VlY5T9U5RpDGzYchmV0i2cxIx9y+FQte+iIVJbOS/xntPfUzd0ODka2BLh6gdG\nt/YHKz6PUC34EklIEOMHu5keVOkdf5KhxmLVgl7TwtUtiYwDtwBdgR52wGB6ujSb\nRHhTb5VUBAFjRCegfWVuqEV27ujaP5GPb9EhbjHAGCFgut3h9irkOpihyASudU0y\nNyysDccBuAigqJtVOMqzZ9vhdpzUhYwtsBHgs0M4LbN+PL87lTdx78k/FZNqCeuF\njlmg+Km/AgMBAAECggEAaGq5BExkwUYn2g+3fxKAOjMH9hmeGxswAApAC4UiPOkm\nzTl60oqRPL2oo666kHMLh7iV2s6yxa5qXL+x8fj/qS7UjWNiVr6zf16hremalfTt\nVnd4yKUpD7LhnJQVELVrLndSMawKk/piiQRV3OAO1/+W/hvSILnhzXjw/vJXqfmy\nrSdfHY+/TvDHo0TDehWc6NZouUErh+tX21kAEfWj0uJECWUuuW9rDyn4tDJQZ30x\nUhHqfIa9oKL8IW9xg4Y5zt3fxusxBMFO9Otq06VTO7QolzFu/CJbsBtlD1HmjrnN\nJG7drKfJLS2Ug3vLZPzTppIss+EqJ/uDsORViWRSwQKBgQD/yqaKm4GZIKO7YHni\nmSMYO2iC4WUawqDDjd2r0axdj+MH7R/23qnCgY6TbcToJuCtfqmrkk2x8lRm8bkv\nu/MJ+jFVKC+v7orQajlO2kNPfUObGK3Nf/AJcXJborQPWt4JTDh/7P2tHDMW7G0w\nF6Nwey1EdEQiwNf5hHCNz42wQQKBgQD6E9BOtXyueUD/15LUp8fichJi5JfS6jVw\nonTIoye4qmYEYMjZO9mRTOUgGS+RfkZlp43t5h+kec/kSd9Lmwr2pwtdjpJOm9ca\nYX2vKihdh9XB+rtC9qgne+62hmtqL8MnTwpXcdjgGeMpQsJifkhu+ajEm7nN3XwA\nKYt6TK/Z/wKBgDuYVmbyxiYMEbmlR6CAt0l9BeOAahLrB5OoKN5QMo116Zo+J/VX\neUvE7Zfxui+wZyZk3VkI9CsiX4HAjbnOW1iWvwmtHDcsJ5FZPlLdzVLmx2qKPGwl\ng6JfmRo6dSMis5qM9JjxeUTszgZoPSQ4Ta72M9zADePe9DLBJYwUsFlBAoGBALcg\nAT9R6R5+jlmLC+uLfXTWIZ6nVIJPnZiAblJqH3E73n7APPPOvvCGxZYuu0WomXZh\nLy6RgIRZ6yF58vkTbQDXrBvzhjHoLqkT0QyPK4XqLV7h83UC2HopZ9HjNw9IMHk9\niQ4lwTHB4zXYvC2R2grh6XMnsfUNhns78PY6598TAoGAElrq9G+wVtXACUce+kof\nkdbUEFDkx/36Q+Esvkjc3q8OEH0dPVuXhBXFUohXJaxyFfUMCHsLscxfZKZPfWzC\nV7r+4nAJJDsoLRXyetVmkNd6cK794zkib7QhP3muD5zTkXgew9qSAKg0yG/2GSqx\nI83QOpMdS6YyGpSEEjFaa64=\n-----END PRIVATE KEY-----\n",
  }),
});
//@ts-ignore
export const sendFCM = async (token, title, body) => {
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
    });
    console.log(`FCM sent to: ${token}`);
  } catch (err) {
    console.error("FCM ERROR:", err);
  }
};
