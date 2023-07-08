const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const gravatar = require("gravatar");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");

const cloudinary = require('../utils/cloudinary')

const { User } = require("../models/user");
const {
  HttpError,
  ctrlWrapper,
  resizeImgAvatar,
  sendEmail,
} = require("../helpers");

const { SECRET, BASE_URL } = process.env;

const avatarsDir = path.join(__dirname, "../", "public", "avatars");

const register = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    throw HttpError(409, "Email already in use");
  }

  const HashPassword = await bcrypt.hash(password, 10);

  const verificationTokenId = nanoid();

  const newUser = await User.create({
    ...req.body,
    avatarURL: gravatar.url(email),
    password: HashPassword,
    verificationToken: verificationTokenId,
  });

  const verificationEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/users/verify/${verificationTokenId}">Click to verify email</a>`,
  };

  await sendEmail(verificationEmail);

  res.status(201).json({
    user: { email: newUser.email, name: newUser.name },
  });
};

const login = async (req, res) => {
  const { password, email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(401, "Email or password is wrong");
  }

  const passwordCompare = await bcrypt.compare(password, user.password);

  if (!passwordCompare) {
    throw HttpError(401, "Email or password is wrong");
  }

  if (!user.verify) {
    throw HttpError(401, "Email not verified");
  }

  const payload = { id: user._id };

  const token = jwt.sign(payload, SECRET, { expiresIn: "23h" });
  await User.findByIdAndUpdate(user._id, { token });

  res.status(200).json({
    token,
    user: {
      email: user.email,
      name: user.name,
    },
  });
};

const getCurrent = async (req, res) => {
  const { email, name } = req.user;
  res.status(200).json({ email, name });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: "" });

  res.status(204).json({});
};

const updateUserSubscription = async (req, res) => {
  const { _id, subscription } = req.user;

  if (subscription) {
    HttpError(409, "You have already subscribed");
  }

  await User.findByIdAndUpdate(_id, { subscription: true }, { new: true });

  // Відправляєм емейл

  res
    .status(200)
    .json({ message: "You successfully subscribed to newsletter" });
};

const updateAvatar = async (req, res) => {
  const { path: tempUpload, originalname } = req.file;
  const { _id } = req.user;

   const uploadRes = await cloudinary.uploader.upload(
     req.file.path,
     { upload_preset: "avatars" },
     function (error, result) {
       if (error) {
         return res.status(500).json({
           message: error,
         });
       }
       return result;
     }
   );
    console.log(uploadRes)
  // await resizeImgAvatar(tempUpload);
  // const newFileName = `${_id}_${originalname}`;
  // const resultUpload = path.join(avatarsDir, newFileName);
  // await fs.rename(tempUpload, resultUpload, () => {});
  // const avatarURL = path.join("avatars", newFileName);
 
  const avatarURL =  uploadRes.url
  await User.findByIdAndUpdate(_id, { avatarURL });

  res.json({ avatarURL });
};

const verifyUser = async (req, res) => {
  const { verificationToken } = req.params;

  const user = await User.findOne({ verificationToken });

  if (!user) {
    throw HttpError(404, "User not found");
  }

  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: null,
  });

  res.json({ message: "Verification successful" });
};

const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(404, "User not found");
  }

  if (user.verify) {
    throw HttpError(400, "Verification has already been passed");
  }

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="http://localhost:3000/users/verify/${user.verificationToken}">Click verify email</a>`,
  };

  await sendEmail(verifyEmail);

  res.json({
    message: "Verification email sent",
  });
};

module.exports = {
  register: ctrlWrapper(register),
  login: ctrlWrapper(login),
  getCurrent: ctrlWrapper(getCurrent),
  logout: ctrlWrapper(logout),
  updateUserSubscription: ctrlWrapper(updateUserSubscription),
  updateAvatar: ctrlWrapper(updateAvatar),
  verifyUser: ctrlWrapper(verifyUser),
  resendVerificationEmail: ctrlWrapper(resendVerificationEmail),
};
