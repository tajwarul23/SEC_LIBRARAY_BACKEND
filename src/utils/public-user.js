export function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    regNo: user.regNo,
    email: user.email,
    department: user.department,
    Session: user.Session,
    gender: user.gender,
    role: user.role,
    fine: user.fine,
  };
}
