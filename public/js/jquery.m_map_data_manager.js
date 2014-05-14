/**
 * 地図データ管理
 * ●イベント
 * データ更新前イベント on_map_data_change_befor (void)
 * データ要求中イベント on_map_data_requesting (request_args：APIリクエスト引数obj )
 * データ要求完了イベント on_map_data_completion (void)
 * データ要求エラー　    on_map_data_fail (textStatus,jqXHR.responseText)
 * データ要求受信中 (行政区に該当する掲示板の問い合わせ 経過監視用)　on_map_data_done (offset,total_count)
*/

(function($) {
//=============================================================================
// 初期化　コンストラクタ
//=============================================================================
$.m_map_data_manager = function(element, options) {
  var plugin = this;
  var defaults ={
        'status_id':'open',//取得モード　未貼付け close 終了 open 引数のリテラル確認
        'category_ids':[],
        'location':[]
   };
  plugin.settings = {};
  var $element = $(element),element = element;
  var _select_comp_list={};
  var _select_comp_list_data={};
  var _map_data={};
  var _del_map_list=[];
  var _add_map_list=[];
  var _overlay = {};
  var _is_show_info=false;
  var _zoomLevel;
  var _load_record_info={};//読み込み対象のレコード情報を行政区別に格納
  var _issue_categories={};
  var _nowposition_marker;
  var  _total_pos_count=0;
  ////////usr constructor//////////////
  plugin.init = function() {
    plugin.settings = $.extend({}, defaults, options);//デフォルト値の上書き

    if(plugin.settings.map){
      //地図のズーム時の処理
      _zoomLevel=plugin.settings.map.getZoom();
      google.maps.event.addListener(plugin.settings.map, 'zoom_changed', function(){
        _zoomLevel = plugin.settings.map.getZoom();
       plugin.set_show_info();//マーカーの表示
      });

        //現在位置のマーカー
        var img = new google.maps.MarkerImage(
            'img/bluedot.png',
            null, // size
            null, // origin
            new google.maps.Point( 8, 8 ), // anchor (move to center of marker)
            new google.maps.Size( 17, 17 ) // scaled size (required for Retina display icon)
        );
        _nowposition_marker= new google.maps.Marker({
            flat: true,
            icon: img,
            map: plugin.settings.map,
            optimized: false,
            title: 'nowpos_ico',
            visible: true,
            zIndex:9999 //todo::どんな高い値を設定してもmarkerclustererが最前面に来て隠れる
        });
    }
        //ブックマークデータをstorageから読み込み
        var ls=_load_storage("bookmark");
        for(var i in ls){
            _select_comp_list_data[i]=ls[i];
            _select_comp_list[i]=true;
        }
    };
//=============================================================================
// public method
//=============================================================================

    /**
     * オーバレイの取得
     */
    plugin.get_overlay=function(){
        return _overlay;
    }
    /**
     * マーカーの表示設定
     */
    plugin.set_show_info=function(flg){
        _is_show_info=(flg==undefined)?_is_show_info:flg;
        //ラベル表示・非表示設定（一定以下の縮尺で表示）
        var info_sw=(_is_show_info&&(_zoomLevel >= 16))?true:false;
        for (var i in _overlay){
            _overlay[i].show_info(info_sw);
        }
    }
    /**
     * ステータスの変更
     */
    plugin.set_status=function(str){
        plugin.settings.status_id=str;
    }
    /**
     * 読み込む行政区のリスト設定
     * @param array
     */
    plugin.set_category_ids=function(array){
        plugin.settings.category_ids=array;
    }

    /**
     * 近くの掲示板の取得用ロケーション設定
     * @param array ([lat,lng])
     */
    plugin.set_location=function(array){
        plugin.settings.location=array;
    }
    /**
     * 現在位置用のマーカー移動
     */
    plugin.set_nowposition_marker=function(pos_coords){
        //var heading=pos_coords.heading //デバイスの向き。北をゼロとした角度で表したもの
        //var accuracy=pos_coords.accuracy//位置の精度（何メートルほど誤差があるか）
        var lat=pos_coords.latitude;
        var lng=pos_coords.longitude
        _nowposition_marker.setPosition(new google.maps.LatLng(lat,lng));
    }
    /**
     * 現在位置のマーカー座標を取得 LatLng
     */
    plugin.get_nowposition_marker=function(){
        return _nowposition_marker.getPosition()
    }
    /**
     * カテゴリーデータを設定
     */
    plugin.set_issue_categories=function(cat){
        $.each(cat,function(i,val){
            _issue_categories[val.id]=val.name;
        });
    }
    /**
     * カテゴリ名を取得
     */
    plugin.get_issue_categorie_names=function(){
        return _issue_categories;
    }
  /**
   * 行政区に該当する掲示板の問い合わせ
   */
  plugin.load_data = function(cb){
        if(!plugin.settings.category_ids.length){return;}
        //データ更新前イベント
        $(element).trigger("on_map_data_change_befor");
        //行政区複数選択の場合はループで呼び出す
        for(var i in plugin.settings.category_ids){
            _load(plugin.settings.category_ids[i]);
        }
        //
        function _load(cat_id,offset){
            offset=(isNaN(parseInt(offset)))?0:offset;
            //var request_args={'key':API_KEY,'status_id':plugin.settings.status_id,'category_id':cat_id,'offset':offset,'limit':ISSU_LIMIT};
            var request_args={'status_id':plugin.settings.status_id,'category_id':cat_id,'offset':offset,'limit':ISSU_LIMIT};
            $(element).trigger("on_map_data_requesting",[request_args]);//データ要求中イベント
            $.getJSON(ISSU_URL, request_args, _cb)
                .fail(function(jqXHR, textStatus, errorThrown) {
                    $(element).trigger("on_map_data_fail",[textStatus,jqXHR.responseText]);//エラー時
                })
                .done(function(json) {
                  //  $(element).trigger("on_map_data_done",[json]);//成功時(経過監視用)

                });
          //load_data用CB //上限以上のレコードがある場合はoffsetを追加してさらに読み込む
          function _cb(d){
              //len、limit、offsetが無い場合の担保（無限ロード防止）
              var limit=(d.issues.length)?d.issues.length:ISSU_LIMIT;
              var offset=(d.offset)? d.offset:0;
              var total_count=(d.total_count)? d.total_count:0;
              _total_pos_count=total_count;

              _receive_new_area(d);
              $(element).trigger("on_map_data_done",[offset,total_count]);//成功時(経過監視用)
              //total_countに満たない場合は追加読み込み
              if((offset+limit)<total_count){
                  _load(cat_id,offset+limit);
              }else{
                  $(element).trigger("on_map_data_completion");//データ要求完了イベント
                  if(typeof cb =='function'){
                      cb();
                  }
              }
          }
        }

  };

  /**
   * 現在地近くの掲示板の問い合わせ
   */
  plugin.load_nearby_data = function(cb){
        if(!plugin.settings.location.length){return;}
        var loc = plugin.settings.location;
        //データ更新前イベント
        $(element).trigger("on_map_data_change_befor");
        var request_args={'status_id':plugin.settings.status_id,'sort':'geom:' + loc.join(','),'offset':0,'limit':ISSU_LIMIT};
        $(element).trigger("on_map_data_requesting",[request_args]);//データ要求中イベント
        $.getJSON(ISSU_URL, request_args, _cb)
          .fail(function(jqXHR, textStatus, errorThrown) {
                $(element).trigger("on_map_data_fail",[textStatus,jqXHR.responseText]);
            })
          .done(function(json) {
                $(element).trigger("on_map_data_done",[json]);
            });

      //load_data用CB //上限以上のレコードがある場合はoffsetを追加してさらに読み込む
      //todo::現状は付近検索のAPIは中心位置から近い順にMAX100件しか帰らない為、追加読み込みは不要
      function _cb(d){
          //len、limit、offsetが無い場合の担保
          var limit=(d.limit)?d.limit:ISSU_LIMIT;
          var offset=(d.offset)? d.offset:0;
          var total_count=(d.total_count)? d.total_count:0;
          _total_pos_count=total_count;
          //$(element).trigger("on_map_nearby_data_done",[offset,total_count]);//成功時(経過監視用)
          if((offset+limit)<total_count){
            // todo::追加読み込み　alert("現在の範囲では"+limit+"以上の件数があります。"+limit+"件以上は表示されません。\r縮尺を下げて表示して下さい。")
          }
          _receive_new_area(d);

          $(element).trigger("on_map_data_completion");//データ要求完了イベント
          if(typeof cb =='function'){
              cb();
          }
      }
  };


    /**
     * マーカーデータのclear
     */
    plugin.map_data_clear=function(){

        MapOverlay.prototype.clear_markers();//markerの一括消去
        for(var i in _overlay){
            if(_overlay[i]){
                delete _overlay[i];
            }
        }
        _map_data={};
    }
    /**
     * マーカー全体を表示出来るサイズにズームする
     */
    plugin.set_current_map_position=function(){
        var bounds = new google.maps.LatLngBounds();
        var map_div_size={height:map.getDiv().offsetHeight,width:map.getDiv().offsetWidth};
        // マーカー全体を囲む矩形を算出
        var obj_len=0;
        for (var i in _overlay){
            var m=_overlay[i].get_marker_position();
            if(m){
                bounds.extend(m);
            }
            ++obj_len;
        }
        if(obj_len){
            map.setCenter(bounds.getCenter());
            //map.setZoom(ZOOM_LEVEL);
            map.setZoom(_getBoundsZoomLevel(bounds,map_div_size)+1);//1段よけいにズーム調整
        }else{
            map.setCenter(new google.maps.LatLng(DEFAULT_LAT,DEFAULT_LNG));
            map.setZoom(ZOOM_LEVEL);
        }
        //マーカー全体の中心を求める
    }

    /**
     * ブックマークの追加
     */
    plugin.tlg_bookmark=function(rec_id){
        if(_select_comp_list[rec_id]){
            delete _select_comp_list[rec_id];
            delete _select_comp_list_data[rec_id];
        }else{
            _select_comp_list[rec_id]=true;
            //ブックマークの情報追加
            var rec=_map_data[rec_id];
            _select_comp_list_data[rec_id]=
            {
                'id':rec_id,
                'add_time':comDateFormat(new Date(),'yyyy/MM/dd HH:mm'),
                'description':rec.description,
                'subject':rec.subject,
                'status':{'id':rec.status.id,'name':rec.status.name}
            }
        }
        _save_storage("bookmark",_select_comp_list_data)//storage保存
        _overlay[rec_id].refresh();//再描画
    }
    /**
     * ブックマークの全削除
     */
    plugin.clear_bookmark=function(id){
        _save_storage("bookmark",{});
        for(var i in _select_comp_list){
            delete _select_comp_list[i];
            delete _select_comp_list_data[i];
            if(_overlay[i]){
                _overlay[i].refresh();//再描画
            }
        }
    }
    /**
     * ブックマークのリストを取得
     */
    plugin.get_bookmark=function(){
        var list=[];
        for(var i in _select_comp_list_data){
            list.push(_select_comp_list_data[i]);
        }
        //日付でソートして返す
        list.sort(function(a, b){
            if (a.add_time > b.add_time){
                return -1
            }
            if (a.add_time < b.add_time){
                return 1
            }
            return 0;
        });
        return list;
    }

    /**
     * 読み込んだポスター件数情報の取得 （地域選択用）
     */
    plugin.get_load_pos_info_count=function(){
        //console.time('timer');
        var now_cnt={};
        // _overlay[id].data_.status.id を総なめして算出
        for(var idx in _overlay){
            var pos_data=_overlay[idx].data_;
            var id=pos_data.status.id;
            now_cnt[id]=now_cnt[id]==undefined?1:++now_cnt[id];
        }
        //console.timeEnd('timer');
        return{'now_cnt':now_cnt,'total_count':_total_pos_count};
    }
    /**
     * 画面上に表示されているポスター件数情報の取得 （GPS追尾用）
     * todo::現在の画面上の表示件数カウントしたいがGMAPにそのようなAPI自体が無い為、保留（Markermanagerで別途管理するのはコスト高い）
     * 現状はtotalのみ返す
     */
    plugin.get_view_disp_pos_info_count=function(){
        var now_cnt={};
        for(var idx in STATUS_DATA_LIST){
            now_cnt[idx]=undefined;
        }
        return{'now_cnt':now_cnt,'total_count':_total_pos_count};
    }
//=============================================================================
// private method
//=============================================================================
    /**
     * 永続データの保存
     */
    var _save_storage=function(key,obj){
        var storage_json_str="";
        try{
            storage_json_str = JSON.stringify(obj);
        }catch(e){
            storage_json_str="";
        }
        if(!window.localStorage){
            //ieではローカルhtmlで動作しない
            alert("このブラウザではlocalStorageは使えません");
            return;
        }else{
            // new String()でオブジェクトとして明示しないと、代入値がnullの場合、IE8でクラッシュする
            window.localStorage[key] = new String(storage_json_str);
            return true;
        }
    }
    /**
     * 永続データの取得
     */
    var _load_storage=function(key){
        var storage_json_str="";
        if(!window.localStorage){
            alert("このブラウザではlocalStorageは使えません");
            return;
        }else{
            storage_json_str=window.localStorage[key];
        }
        var obj=null;
        try{
            obj=JSON.parse(storage_json_str);
        }catch(e){
            //alert(e);
        }
        return obj;
    }

    /**
     * 永続データの全削除
     */
    var _all_delete_storage=function(){
        if(!window.localStorage){
            return false;
        }else{
            window.localStorage.clear();
            return true;
        }
    }

  /**
   * マーカーデータの受信時
   *
   */
  var _receive_new_area= function(json_d){
      //--------------------------------------------------------
      //連続して読み込むとマーカーのキャッシュ(_overlay)が溜まるので、一定以上で解放(map_data_clear())する
      //--------------------------------------------------------
      if(gps_tracking_mode&&(MAKER_CASH_MAX_LEN <= Object.keys(_overlay).length)){
          plugin.map_data_clear();
      }
    _data_substitution(json_d);
    _map_data_draw();//マーカーの描画
  //  plugin.set_current_map_position();//マーカー全体を表示出来るように
    //データ更新完了イベント
    $(element).trigger("on_map_data_change_after");
  };

  /**
   * データの差分更新
     * todo::API側でで表示している地図の矩形範囲(4点の経度緯度)に該当する掲示板を返せるような仕様ならば、ここを改修
   */
  var _data_substitution= function(data){
        if(!data.issues){return;}
        var list={};
        $.each(data.issues,function(i,val){
            //geometryのlatlngの値をチェックしnullの物は除外する（nullだとmarker生成で影響が出る）
            if(_geometry_str_check(val.geometry)){
                list[val.id]=val;
            }else{
                if(val){
                    console.log("//err/////",'\t id:'+val.id+'\t description:'+val.description+'\t subject:'+val.subject+'\t geometry:'+val.geometry);
                }
            }
        });

    //新しく追加される差分を検出
        _add_map_list=[];
        for(var i in list){
            if(!_map_data[i]){//{id番号:掲示板データ,id番号2:掲示板データ}
                _add_map_list.push(i);
                _map_data[i]=list[i];
            }
        };
    /*
     //---------------------------//
     //todo::API側でで表示している地図の矩形範囲(4点の経度緯度)に該当する掲示板を返せるような仕様ならば、ここを改修
     //---------------------------//
    //削除される差分を検出（追加したdata以外の物）
    _del_map_list=[];
    for(var d in _map_data){
      if(!data[d]){
        _del_map_list.push(d);
      }
    }*/
  };

  /**
   * 追加・削除する掲示板データを元にマーカーを追加・削除
   *
   */
  var _map_data_draw=function(){
    for (var i in _add_map_list){
      var id=_add_map_list[i];
      var data=_map_data[id];
      if(data){
        _overlay[id]=new MapOverlay(map, data,plugin,_select_comp_list);
        _overlay[id].refresh();
      }
    }

    /*
     //---------------------------//
     //API側で経度緯度で該当する掲示板を返せるような仕様ならば、以下で画面外のマーカーを削除する
     //---------------------------//
     //エリアの削除
    for (var d in _del_map_list){
      var id=_del_map_list[d];
      var ov=_overlay[id];
      if(ov){
        ov.delete_marker();
        delete _overlay[id];
      }
    }*/
        plugin.set_show_info();
  }
    /**
     * 矩形に収まるようにズームレベルを算出する
     */
    var _getBoundsZoomLevel=function(bounds, mapDim) {
        var WORLD_DIM = { height: 256, width: 256 };
        var ZOOM_MAX = MAXZOOM;

        function latRad(lat) {
            var sin = Math.sin(lat * Math.PI / 180);
            var radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
            return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
        }

        function zoom(mapPx, worldPx, fraction) {
            return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
        }

        var ne = bounds.getNorthEast();
        var sw = bounds.getSouthWest();

        var latFraction = (latRad(ne.lat()) - latRad(sw.lat())) / Math.PI;

        var lngDiff = ne.lng() - sw.lng();
        var lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;

        var latZoom = zoom(mapDim.height, WORLD_DIM.height, latFraction);
        var lngZoom = zoom(mapDim.width, WORLD_DIM.width, lngFraction);
        var r=Math.min(latZoom, lngZoom, ZOOM_MAX);

        return isNaN(r)?MINZOOM:r;
    }



    /**
     * geometryのlatlngの値をチェック
     * @returns {*}  値がある場合は [lat,lng] 無い場合はundefined
     */
    var _geometry_str_check=function(geometry_str){
        var geo=eval("a="+geometry_str);
        if(geo.coordinates){
            if(!isNaN(parseInt(geo.coordinates[1]))&& !isNaN(parseInt(geo.coordinates[0]))){
                return true;
            }else{
                return false;
            }
        }
    }
//=============================================================================
// plgin private method
//=============================================================================
  plugin.init();
};
 
 $.fn.m_map_data_manager = function(options) {
  return this.each(function() {
   if (void(0) == $(this).data('m_map_data_manager')) {
    var plugin = new $.m_map_data_manager(this, options);
    $(this).data('m_map_data_manager', plugin);
   };
  });
 
 };
 
})(jQuery);
