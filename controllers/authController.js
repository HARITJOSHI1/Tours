const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/AppError');
const sendEmail = require('./../utils/email');

// AUTHENTICATION
const signToken = (id) => {
  const t = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_TIMEOUT,
  });

  return t;
};

exports.signUp = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  const token = signToken(newUser._id);

  res.status(201).json({
    status: 'signedUp',
    token,
    data: {
      users: newUser,
    },
  });
});

exports.login = catchAsync(async (req, res, next) => {
  // 1. check whether email and password exists
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please enter your email or password', 401));
  }

  // 2. check whether user exist or signed up
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect user or password', 401));

  // 3. create token
  const token = signToken(user._id);

  // 4. Send response
  res.status(200).json({
    status: 'loggedIn',
    token,
  });
});

// #####################################################################

// Protecting routes middleware

exports.protect = catchAsync(async (req, res, next) => {
  // 1. Getting token and check of it if its there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. Verify token and its payload
  if (!token)
    return next(
      new AppError('You are not logged in! Please log in to get access', 401)
    );
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  console.log(decoded);

  // 3. Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser)
    return next(
      new AppError("The user belonging to this token doesn't exist"),
      401
    );

  // 4. Check if user changed password after the token was issued
  if (currentUser.changedPassword(decoded.iat)) {
    return next(
      new AppError('The password is changed so please login again'),
      400
    );
  }

  req.user = currentUser;
  next();
});

// AUTHORIZATION
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You don't have permission to perform this action", 403)
      );
    }

    next();
  };
};

// Reset password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1. Get the user
  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return next(new AppError('There is no user with that email address.'), 404);

  // 2. Generate reset token

  // returning our reset token
  const resetToken = user.createResetPasswordToken();
  console.log(resetToken);

  // To save the changes when certain properties are
  // updated using instance funcs()
  await user.save({ validateBeforeSave: false });

  // 3. Send it to user
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/resetPassword/${resetToken}`;

  const message = `Forgot your password ? You can submit a new request with your new password to: ${resetURL}. If you remember your password then ignore this email.`;

  // Handling errors when sending an email
  try {
    await sendEmail({
      email: req.body.email,
      subject: 'Your password reset token (valid for 10 mins)',
      text: message,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token send to email !',
    });
  } catch (err) {
    user.resetToken = undefined;
    user.passResetTokenexp = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError(
        'There was an error to send the email! Please try again later.',
        500
      )
    );
  }
});

exports.resetPassword = (req, res, next) => {
  console.log('Reset password request accepted');
};
