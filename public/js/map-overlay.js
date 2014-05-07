//=============================================================================
// marker
//=============================================================================
var MarkerCluster;
var MapOverlay_Overlap_chlist={};
//markerのSTATUS種類　1:未完了 5:完了　99:ブックマーク時のアイコン色
MAKER_STATUS_S={
    0:{'color':'336699'},//default
    1:{'color':'FC7790'},
    5:{'color':'32ceff'},
    99:{'color':'44f186'}//マーク
};
MARKERCLUSTER_GRIDSIZE=50;
MARKERCLUSTER_MAXZOOM=15;
MARKERCLUSTER_IMG_DIR="js/markers/";//マーカのディレクトリ　「markers/ステータスID/1〜5.png」



function MapOverlay(map,data,manager_ref,select_comp_list) {
    if(!MarkerCluster){
        MarkerCluster={};
        for(i in MAKER_STATUS_S){
            MarkerCluster[i]=new MarkerClusterer(map,[],{
                imagePath:MARKERCLUSTER_IMG_DIR+i+"/m",
                imageExtension:"png"
            });
            MarkerCluster[i].setGridSize(MARKERCLUSTER_GRIDSIZE);
            MarkerCluster[i].setMaxZoom(MARKERCLUSTER_MAXZOOM);
        }
    }

    this.select_comp_list=select_comp_list;
    this.map_ = map;
    this.data_ = data;
    this.priority=data.priority.id;//優先度2014/03/12 add
    this.id=data.id;
    this.info= new google.maps.InfoWindow();
    this.info.setOptions({"disableAutoPan":false});//吹き出しを地図の中心に持ってくるか
    this.latlng=null;
    this.status_id=MAKER_STATUS_S[data.status.id]?data.status.id:0;//MAKER_STATUS_Sに定義された物以外はdefaultのマークに

    var geo=eval("a="+this.data_.geometry);
    if(geo.coordinates){
        if(!isNaN(parseInt(geo.coordinates[1]))&& !isNaN(parseInt(geo.coordinates[0]))){
            this.latlng=new google.maps.LatLng(geo.coordinates[1],geo.coordinates[0]);
        }else{
            this.latlng=new google.maps.LatLng("39.8781539650443","139.84579414129257");//往くアテが無いなら富士山でも登りたい
        }
    }


    //this.marker = new google.maps.Marker({'map': this.map_,'position': this.latlng});
    this.marker = new google.maps.Marker();

    //重なる場合は5mづつ右に座標をずらす
    var ch=_ad_overlap_man(this.latlng);
    if(ch){
        this.latlng=_m_to_latlon(this.latlng,5*ch,5*ch);
    };

    this.marker.setPosition(this.latlng);

    MarkerCluster[this.status_id].addMarker(this.marker); // markerclusterを表示（間引き表示）
    // this.marker.setMap(map);//マーカーでの表示
    /* マーカーがクリックされた時 */
    var self=this;
    google.maps.event.addListener(this.marker, 'click', function() {
        self.show_info(true);
    });


    //重なり管理用
    function _ad_overlap_man(latlng){
       var v= latlng.toUrlValue();
        MapOverlay_Overlap_chlist[v]=(MapOverlay_Overlap_chlist[v]==undefined)?0:++MapOverlay_Overlap_chlist[v];
        return MapOverlay_Overlap_chlist[v];
    }
    //距離から緯度経度変換
    function _m_to_latlon(latlng,x,y){
        var eh=6378137;
        var lat= (x / eh * Math.cos(latlng.lng() * Math.PI / 180) + latlng.lat() * (Math.PI  / 180)) * (180 / Math.PI );
        var lng=(y /eh +latlng.lng() *(Math.PI  / 180)) * (180 / Math.PI );
        return new google.maps.LatLng(lat,lng);
    }

}
/**
 * アイコン生成
 */
MapOverlay.prototype.createIco_img = function(is_select,is_large) {

    var status_id=this.status_id;
    var color=is_select?MAKER_STATUS_S[99].color:MAKER_STATUS_S[status_id].color;
    var status= this.data_.status.name.substring(0,1);
    var rv="";
    //アイコンの大小
    if(is_large){
        rv="http://chart.apis.google.com/chart?chst=d_map_spin&chld=0.8|0|"+color+"|16|b|"+status;
    }else{
        rv="http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld="+status+"|"+color+"|000000";
    }
    return rv;


}

/**
 * 吹き出し表示
 * @param flg 表示・非表示
 */

MapOverlay.prototype.show_info = function(flg) {
    if(flg){
        if(currentInfoWindow){
            currentInfoWindow.close();
        }
        this.info.open(this.map_,this.marker);
        currentInfoWindow=this.info;
        twttr.widgets.load();
    }else{
        this.info.close();
        currentInfoWindow=undefined;
    }
}

MapOverlay.prototype.refresh=function(){
    var poster_data=this.data_;
    var id=this.id;
    var description=poster_data.description;
    var subject=poster_data.subject;
    is_select=false;// var is_select=this.select_comp_list[id];//ブックマーク用　未使用
    var is_large=(this.priority==5);//優先度が「今すぐ：5」ならマーカーのサイズを大きくする

    var mapinfo=$('<div class="info_w_contents " style="margin: 5px;"><div class="meta">' +'ID:'+id+'　'+this.data_.status.name+'</div><div class="add">'+subject + '(' + description+')</div><hr/></div>');
    var com_btn=$('<button class="com_btn btn">共有</button>').click(function(){
      $(document).trigger("on_maker_commbtn_click",[poster_data]);//共有ボタン押下イベント
    });
    mapinfo.append(com_btn);
    this.info.setContent(mapinfo.get(0));



    this.marker.setIcon(this.createIco_img(is_select,is_large));
}


MapOverlay.prototype.get_marker_position=function(){
    return this.latlng;
}
MapOverlay.prototype.get_marker=function(){
    return this.marker;
}
/**
 * markerの削除
 */
MapOverlay.prototype.delete_marker=function(){
    var p=this.marker.getPosition();
    if(p){
        MapOverlay_Overlap_chlist[p]=(MapOverlay_Overlap_chlist[p])?--MapOverlay_Overlap_chlist[p]:undefined;
    }
    MarkerCluster[this.status_id].removeMarker(this.marker);
}
/**
 * markerの一括消去 staticメソッド的に動作
 */
MapOverlay.prototype.clear_markers=function(){
    for(i in MarkerCluster){
        MarkerCluster[i].clearMarkers();
    }
    MapOverlay_Overlap_chlist={};
}
