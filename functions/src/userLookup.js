async function lookupCollaboratorByEmail(adminAuth, email) {
  try {
    const user = await adminAuth.getUserByEmail(email);
    return {
      uid: user.uid,
      email: user.email || email,
      displayName: user.displayName || null,
    };
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

module.exports = { lookupCollaboratorByEmail };