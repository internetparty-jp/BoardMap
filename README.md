BoardMap
---------

![BoardMap](https://f.cloud.github.com/assets/72997/2061916/75b7c09c-8c72-11e3-9602-2089755939e7.png)

Development
--------------------

```
> bundle install --path vendor/bundle
> SHIRASETE_API_KEY='xxxxxxxxxxXXXXXXXxxXXXxxxxxxXX' SHIRASETE_PROJECT_ID=22 TITLE='site title' bundle exec rackup
```

then, open http://localhost:9292/ with your browser


How to use on heroku?
---------------------

```
> heroku create
> heroku config:set SHIRASETE_API_KEY='xxxxxxxxxxXXXXXXXxxXXXxxxxxxXX' SHIRASETE_PROJECT_ID=22 TITLE='site title'
> git remote add heroku ${HEROKU GIT REPO}
> git push -u heroku master
```

SHIRASETE_PROJECT_IDs
---------------------

* 22 for 2014年東京都知事選挙 家入陣営
* 32 for 2014年大阪市長選挙 マック赤坂陣営
* 33 for 2014年秩父市議会議員選挙 清野和彦陣営
