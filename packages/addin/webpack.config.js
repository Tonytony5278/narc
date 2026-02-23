/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const devCerts = require('office-addin-dev-certs');

module.exports = async (env, options) => {
  const isDev = options.mode === 'development';

  // Get dev certs for HTTPS (required by Office Add-ins)
  const httpsOptions = isDev ? await devCerts.getHttpsServerOptions() : undefined;

  return {
    mode: isDev ? 'development' : 'production',
    devtool: isDev ? 'source-map' : false,
    entry: {
      taskpane: './src/taskpane/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].bundle.js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.[tj]sx?$/,
          use: {
            loader: 'ts-loader',
            options: { transpileOnly: true }, // typecheck runs separately via tsc --noEmit
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'taskpane.html',
        template: './src/taskpane/index.html',
        chunks: ['taskpane'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.xml', to: 'manifest.xml' },
          { from: 'assets', to: 'assets' },
        ],
      }),
    ],
    devServer: {
      port: 3000,
      server: isDev ? { type: 'https', options: httpsOptions } : undefined,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      hot: true,
    },
  };
};
