require 'sinatra'
require "sinatra/reloader" if development?
require 'uri'
require 'open-uri'
require 'json'
require 'pp'

  SHIRASETE_BASE_URL = ENV['SHIRASETE_BASE_URL'] || "http://beta.shirasete.jp/"
   SHIRASETE_API_KEY = ENV['SHIRASETE_API_KEY']
SHIRASETE_PROJECT_ID = ENV['SHIRASETE_PROJECT_ID']
               TITLE = ENV['TITLE'] || 'Board Map'

configure do 
  conn = Faraday::Connection.new(:url => SHIRASETE_BASE_URL) do |builder|
    builder.use Faraday::Request::UrlEncoded  # リクエストパラメータを URL エンコードする
    builder.use Faraday::Response::Logger     # リクエストを標準出力に出力する
    builder.use Faraday::Adapter::NetHttp     # Net/HTTP をアダプターに使う
  end
  set :faraday, conn

  mime_type :json, 'application/json'
end

get '/' do
  @title = TITLE
  erb :index, :layout => nil
end

get '/issue_categories.json' do
  conn = settings.faraday
  res = conn.get("/projects/#{SHIRASETE_PROJECT_ID}/issue_categories.json", {:key => SHIRASETE_API_KEY})
  content_type :json
  res.body
end

get '/issues.json' do
  puts "issues: #{params.inspect}"
  params[:key] = SHIRASETE_API_KEY
  params[:project_id] = SHIRASETE_PROJECT_ID
  conn = settings.faraday
  res = conn.get("/issues.json", params)
  content_type :json
  res.body
end

#get '/issue/:id.json' do
#end

